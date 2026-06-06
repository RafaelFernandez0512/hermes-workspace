'use client'

import { useEffect, useState } from 'react'
import type { SwarmStatusPayload, CanonicalSwarmStatus } from '@/lib/swarm/canonical-state'

interface IncidentSummaryProps {
  status: SwarmStatusPayload
}

function statusBadgeClass(status: CanonicalSwarmStatus): string {
  switch (status) {
    case 'running':
    case 'starting':
      return 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
    case 'blocked':
    case 'failed':
      return 'bg-red-500/15 text-red-500 border border-red-500/30'
    case 'needs_review':
    case 'recovering':
      return 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
    case 'stale':
      return 'bg-orange-500/15 text-orange-500 border border-orange-500/30'
    case 'completed':
    case 'ready':
      return 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
    case 'paused':
      return 'bg-primary-400/15 text-primary-500 border border-primary-400/30'
    case 'not_started':
    default:
      return 'bg-primary-200/20 text-primary-600 border border-primary-300/30'
  }
}

function statusLabel(status: CanonicalSwarmStatus): string {
  switch (status) {
    case 'not_started': return 'Not started'
    case 'starting': return 'Starting'
    case 'running': return 'Running'
    case 'blocked': return 'Blocked'
    case 'needs_review': return 'Needs review'
    case 'ready': return 'Ready'
    case 'completed': return 'Completed'
    case 'paused': return 'Paused'
    case 'recovering': return 'Recovering'
    case 'failed': return 'Failed'
    case 'stale': return 'Stale'
    default: return status
  }
}

function formatSecondsAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export function IncidentSummary({ status }: IncidentSummaryProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const heartbeatAge = status.lastHeartbeatAt > 0
    ? now - status.lastHeartbeatAt
    : null

  return (
    <div className="flex flex-col gap-3">
      {/* Status badge */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${statusBadgeClass(status.status)}`}
        >
          {statusLabel(status.status)}
        </span>
        {status.isStale && (
          <span className="text-xs text-orange-500 font-medium">STALE</span>
        )}
      </div>

      {/* Phase */}
      {status.phase && status.phase !== 'unknown' && (
        <div className="text-sm text-[var(--theme-muted,var(--color-primary-700))]">
          Phase: <span className="font-medium text-[var(--theme-text,var(--color-ink))]">{status.phase}</span>
        </div>
      )}

      {/* Current worker */}
      {status.currentWorkerId && (
        <div className="text-sm text-[var(--theme-muted,var(--color-primary-700))]">
          Current worker: <span className="font-mono text-[var(--theme-text,var(--color-ink))]">{status.currentWorkerId}</span>
        </div>
      )}

      {/* Last heartbeat */}
      <div className="text-xs text-[var(--theme-muted,var(--color-primary-600))]">
        {heartbeatAge !== null
          ? `Last heartbeat: ${formatSecondsAgo(heartbeatAge)}`
          : 'No heartbeat recorded'}
      </div>

      {/* Swarm ID */}
      <div className="text-xs font-mono text-[var(--theme-muted,var(--color-primary-600))] opacity-60">
        {status.swarmId}
      </div>
    </div>
  )
}
