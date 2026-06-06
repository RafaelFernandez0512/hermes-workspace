'use client'

import type { SwarmStatusPayload, CanonicalSwarmStatus } from '@/lib/swarm/canonical-state'

interface WhyBlockedProps {
  status: SwarmStatusPayload
  swarmId: string
}

const SHOW_WHY_BLOCKED: CanonicalSwarmStatus[] = [
  'blocked',
  'failed',
  'needs_review',
  'recovering',
  'stale',
]

export function WhyBlocked({ status }: WhyBlockedProps) {
  if (!SHOW_WHY_BLOCKED.includes(status.status)) {
    return (
      <p className="text-xs text-[var(--theme-muted,var(--color-primary-600))] italic">
        No blocking condition active.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {status.blockedReason && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-sm font-medium text-red-500">{status.blockedReason}</p>
        </div>
      )}
      {!status.blockedReason && (
        <p className="text-sm text-[var(--theme-muted,var(--color-primary-600))]">
          Status <span className="font-semibold">{status.status}</span> — no specific reason recorded.
          Check worker logs for more details.
        </p>
      )}
      {status.currentWorkerId && (
        <p className="text-xs text-[var(--theme-muted,var(--color-primary-600))]">
          Affected worker: <span className="font-mono">{status.currentWorkerId}</span>
        </p>
      )}
    </div>
  )
}
