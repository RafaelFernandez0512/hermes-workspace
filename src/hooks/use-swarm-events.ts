import { useCallback, useEffect, useRef, useState } from 'react'
import type { SwarmEvent, SwarmMissionSnapshot } from '@/screens/swarm2/detail/types'

const MAX_BUFFER = 2000
const BACKOFF_INITIAL_MS = 1_000
const BACKOFF_MAX_MS = 30_000

type UseSwarmEventsResult = {
  events: Array<SwarmEvent>
  missionSnapshot: SwarmMissionSnapshot | null
  isConnected: boolean
  reconnect: () => void
}

export function useSwarmEvents(missionId: string | null): UseSwarmEventsResult {
  const [events, setEvents] = useState<Array<SwarmEvent>>([])
  const [missionSnapshot, setMissionSnapshot] = useState<SwarmMissionSnapshot | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectKey, setReconnectKey] = useState(0)
  const esRef = useRef<EventSource | null>(null)
  const backoffRef = useRef(BACKOFF_INITIAL_MS)
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const missionIdRef = useRef(missionId)

  useEffect(() => {
    missionIdRef.current = missionId
  })

  const reconnect = useCallback(() => {
    setReconnectKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!missionId) {
      setEvents([])
      setMissionSnapshot(null)
      setIsConnected(false)
      return
    }

    setEvents([])
    setMissionSnapshot(null)
    backoffRef.current = BACKOFF_INITIAL_MS

    function open(): () => void {
      const es = new EventSource(`/api/swarm-mission-events?missionId=${encodeURIComponent(missionId!)}`)
      esRef.current = es

      es.addEventListener('connected', () => {
        setIsConnected(true)
        backoffRef.current = BACKOFF_INITIAL_MS
      })

      const handleSwarmEvent = (raw: MessageEvent, kindOverride?: string) => {
        try {
          const parsed = JSON.parse(raw.data as string) as SwarmEvent & { mission?: unknown; assignment?: unknown }
          const kind = (kindOverride || parsed.kind || raw.type) as SwarmEvent['kind']

          if (kind === 'mission_state' && parsed.payload?.mission) {
            setMissionSnapshot((prev) => ({
              mission: parsed.payload.mission as SwarmMissionSnapshot['mission'],
              assignments: (parsed.payload.mission as SwarmMissionSnapshot['mission']).assignments ?? prev?.assignments ?? [],
              events: (parsed.payload.mission as SwarmMissionSnapshot['mission']).events ?? prev?.events ?? [],
            }))
          }

          if (kind === 'assignment_state' && parsed.payload?.assignment) {
            setMissionSnapshot((prev) => {
              if (!prev) return prev
              const assignment = parsed.payload.assignment as SwarmMissionSnapshot['assignments'][0]
              const existing = prev.assignments.findIndex((a) => a.id === assignment.id)
              if (existing >= 0) {
                const updated = [...prev.assignments]
                updated[existing] = assignment
                return { ...prev, assignments: updated }
              }
              return { ...prev, assignments: [...prev.assignments, assignment] }
            })
          }

          const swarmEvt: SwarmEvent = {
            kind,
            missionId: parsed.missionId ?? missionId!,
            assignmentId: parsed.assignmentId,
            workerId: parsed.workerId,
            ts: parsed.ts ?? Date.now(),
            payload: parsed.payload ?? {},
          }

          if (kind !== 'heartbeat') {
            setEvents((prev) => {
              const next = [...prev, swarmEvt]
              return next.length > MAX_BUFFER ? next.slice(next.length - MAX_BUFFER) : next
            })
          }
        } catch {
          /* ignore malformed events */
        }
      }

      const eventKinds: Array<SwarmEvent['kind']> = [
        'mission_state',
        'assignment_state',
        'checkpoint',
        'blocked',
        'unblocked',
        'tool_use',
        'file_edit',
        'log_tail',
        'cancelled',
        'heartbeat',
      ]
      for (const kind of eventKinds) {
        es.addEventListener(kind, (raw) => handleSwarmEvent(raw as MessageEvent, kind))
      }
      es.addEventListener('history', (raw) => handleSwarmEvent(raw as MessageEvent))
      es.addEventListener('message', (raw) => handleSwarmEvent(raw as MessageEvent))

      es.addEventListener('error', () => {
        setIsConnected(false)
        es.close()
        esRef.current = null
        const delay = backoffRef.current
        backoffRef.current = Math.min(delay * 2, BACKOFF_MAX_MS)
        backoffTimerRef.current = setTimeout(() => {
          if (missionIdRef.current === missionId) {
            open()
          }
        }, delay)
      })

      return () => {
        es.close()
        esRef.current = null
        if (backoffTimerRef.current) {
          clearTimeout(backoffTimerRef.current)
          backoffTimerRef.current = null
        }
      }
    }

    const cleanup = open()
    return () => {
      cleanup()
      setIsConnected(false)
    }
  }, [missionId, reconnectKey])

  return { events, missionSnapshot, isConnected, reconnect }
}
