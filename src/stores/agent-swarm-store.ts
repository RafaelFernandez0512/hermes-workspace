/**
 * Agent Swarm Store — Real-time session monitoring via gateway polling.
 * Connects to /api/gateway/sessions and tracks live agent sessions.
 */
import { create } from 'zustand'
import type { GatewaySession } from '@/lib/gateway-api'
import { BASE_URL } from '@/lib/gateway-api'
import type {
  CanonicalSwarmStatus,
  RecommendedAction,
  SwarmStatusPayload,
} from '@/lib/swarm/canonical-state'
import { STALE_MS } from '@/lib/swarm/canonical-state'

export type SwarmSession = GatewaySession & {
  /** Derived status for UI rendering */
  swarmStatus: 'running' | 'thinking' | 'complete' | 'failed' | 'error' | 'idle'
  /** Time since last update in ms */
  staleness: number
  /** Canonical incident console status */
  canonicalStatus: CanonicalSwarmStatus
  /** Last heartbeat timestamp for this swarm */
  lastHeartbeatAt: number
  /** Whether this swarm session is stale (no heartbeat in 45s) */
  isStale: boolean
  /** Recommended action from canonical state machine */
  recommendedAction: RecommendedAction | null
}

type SwarmState = {
  sessions: Array<SwarmSession>
  isConnected: boolean
  lastFetchedAt: number
  error: string | null
  /** Internal polling interval ref */
  _intervalId: ReturnType<typeof setInterval> | null

  // Actions
  fetchSessions: () => Promise<void>
  startPolling: (intervalMs?: number) => void
  stopPolling: () => void
}

function deriveSwarmStatus(
  session: GatewaySession,
): SwarmSession['swarmStatus'] {
  const status = (session.status ?? '').toLowerCase()
  if (['thinking', 'reasoning'].includes(status)) return 'thinking'
  if (['error', 'errored'].includes(status)) return 'error'
  if (['failed', 'cancelled', 'canceled', 'killed'].includes(status))
    return 'failed'
  if (
    ['complete', 'completed', 'success', 'succeeded', 'done'].includes(status)
  )
    return 'complete'
  if (['idle', 'waiting', 'sleeping'].includes(status)) return 'idle'

  // Heuristic: if no explicit status, use staleness to detect completion
  // Sessions that haven't updated in 30s+ with tokens are likely done
  const updatedAt =
    typeof session.updatedAt === 'number'
      ? session.updatedAt
      : typeof session.updatedAt === 'string'
        ? new Date(session.updatedAt).getTime()
        : Date.now()
  const staleness = Date.now() - updatedAt
  const hasTokens = (session.totalTokens ?? session.tokenCount ?? 0) > 0

  if (hasTokens && staleness > 30_000) return 'complete'
  if (!hasTokens && staleness > 60_000) return 'idle'

  return 'running'
}

function readStringField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function getStopReason(session: GatewaySession): string | null {
  const stopReason = readStringField(session.stopReason)
  return stopReason ? stopReason.toLowerCase() : null
}

function getSessionErrorMessage(session: GatewaySession): string | null {
  return (
    readStringField(session.errorMessage) ??
    readStringField(session.error) ??
    readStringField(session.failureReason) ??
    readStringField(session.lastError)
  )
}

function toSwarmSession(session: GatewaySession, statusPayload?: SwarmStatusPayload): SwarmSession {
  const updatedAt =
    typeof session.updatedAt === 'number'
      ? session.updatedAt
      : typeof session.updatedAt === 'string'
        ? new Date(session.updatedAt).getTime()
        : Date.now()
  const hasExplicitError =
    getStopReason(session) === 'error' ||
    getSessionErrorMessage(session) !== null
  const derivedStatus = deriveSwarmStatus(session)
  const lastHeartbeatAt = statusPayload?.lastHeartbeatAt ?? 0
  const isStale = lastHeartbeatAt > 0 && (Date.now() - lastHeartbeatAt) > STALE_MS

  return {
    ...session,
    swarmStatus: hasExplicitError ? 'error' : derivedStatus,
    staleness: Date.now() - updatedAt,
    canonicalStatus: statusPayload?.status ?? 'not_started',
    lastHeartbeatAt,
    isStale,
    recommendedAction: statusPayload?.recommendedAction ?? null,
  }
}

export const useSwarmStore = create<SwarmState>((set, get) => ({
  sessions: [],
  isConnected: false,
  lastFetchedAt: 0,
  error: null,
  _intervalId: null,

  fetchSessions: async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/gateway/sessions`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()

      const rawSessions: Array<GatewaySession> =
        json?.data?.sessions ?? json?.sessions ?? []

      // Only show subagent sessions in the swarm (not main chat, cron, etc.)
      const agentSessions = rawSessions.filter((s) => {
        const key = s.key ?? ''
        // Must be a subagent session
        if (!key.includes('subagent:')) return false
        // Skip sessions with zero tokens and very old (never ran)
        const tokens = s.totalTokens ?? s.tokenCount ?? 0
        const hasExplicitError =
          getStopReason(s) === 'error' || getSessionErrorMessage(s) !== null
        if (tokens === 0 && !hasExplicitError) {
          const updatedAt =
            typeof s.updatedAt === 'number'
              ? s.updatedAt
              : typeof s.updatedAt === 'string'
                ? new Date(s.updatedAt).getTime()
                : 0
          if (Date.now() - updatedAt > 120_000) return false
        }
        return true
      })

      // Fetch canonical status for active swarms
      const statusPayloads = new Map<string, SwarmStatusPayload>()
      await Promise.allSettled(
        agentSessions.map(async (s) => {
          const swarmId = typeof s.key === 'string' ? s.key : ''
          if (!swarmId) return
          try {
            const statusRes = await fetch(
              `/api/swarm-lifecycle/status?swarmId=${encodeURIComponent(swarmId)}`,
            )
            if (statusRes.ok) {
              const payload = (await statusRes.json()) as SwarmStatusPayload & { ok?: boolean }
              if (payload.ok !== false) {
                statusPayloads.set(swarmId, payload)
              }
            }
          } catch {
            // best-effort
          }
        }),
      )

      const swarmSessions = agentSessions.map((s) => {
        const swarmId = typeof s.key === 'string' ? s.key : ''
        return toSwarmSession(s, statusPayloads.get(swarmId))
      })

      // Sort: running/thinking first, then by updatedAt desc
      swarmSessions.sort((a, b) => {
        const priority = {
          thinking: 0,
          running: 1,
          idle: 2,
          complete: 3,
          failed: 4,
          error: 5,
        }
        const pa = priority[a.swarmStatus] ?? 2
        const pb = priority[b.swarmStatus] ?? 2
        if (pa !== pb) return pa - pb
        return a.staleness - b.staleness
      })

      set({
        sessions: swarmSessions,
        isConnected: true,
        lastFetchedAt: Date.now(),
        error: null,
      })
    } catch (err) {
      set({
        isConnected: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  startPolling: (intervalMs = 5000) => {
    const state = get()
    if (state._intervalId) return // already polling

    // Fetch immediately
    state.fetchSessions()

    const id = setInterval(() => {
      get().fetchSessions()
    }, intervalMs)

    set({ _intervalId: id })
  },

  stopPolling: () => {
    const { _intervalId } = get()
    if (_intervalId) {
      clearInterval(_intervalId)
      set({ _intervalId: null })
    }
  },
}))
