'use client'

import { cn } from '@/lib/utils'
import type { SwarmMissionSnapshot } from './types'

const STATE_COLORS: Record<string, string> = {
  done: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700',
  checkpointed: 'border-violet-400/40 bg-violet-500/10 text-violet-700',
  executing: 'border-blue-400/40 bg-blue-500/10 text-blue-700',
  dispatched: 'border-blue-400/40 bg-blue-500/10 text-blue-700',
  blocked: 'border-amber-400/40 bg-amber-500/10 text-amber-700',
  needs_input: 'border-amber-400/40 bg-amber-500/10 text-amber-700',
  stale: 'border-red-400/40 bg-red-500/10 text-red-700',
  cancelled: 'border-slate-400/40 bg-slate-500/10 text-slate-500',
  queued: 'border-slate-400/40 bg-slate-500/10 text-slate-600',
  waiting_on_dependency: 'border-slate-400/40 bg-slate-500/10 text-slate-600',
  reviewing: 'border-violet-400/40 bg-violet-500/10 text-violet-700',
}

type PlanTabProps = {
  snapshot: SwarmMissionSnapshot | null
  className?: string
}

export function PlanTab({ snapshot, className }: PlanTabProps) {
  if (!snapshot) {
    return (
      <div className={cn('flex-1 flex items-center justify-center text-xs text-[var(--theme-muted)]', className)}>
        Loading plan…
      </div>
    )
  }

  const { mission, assignments } = snapshot

  return (
    <div className={cn('flex-1 overflow-y-auto px-3 py-2', className)}>
      <div className="mb-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--theme-muted)]">Mission</div>
        <div className="mt-1 text-sm font-semibold text-[var(--theme-text)]">{mission.title}</div>
        <div className="mt-1 text-[11px] text-[var(--theme-muted)]">State: {mission.state} · {assignments.length} assignments</div>
      </div>

      <div className="space-y-2">
        {assignments.map((assignment, idx) => {
          const stateClass = STATE_COLORS[assignment.state] ?? 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)]'
          return (
            <div
              key={assignment.id}
              className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-[11px] font-bold text-[var(--theme-muted)]">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-[var(--theme-text)] break-words">{assignment.workerId}</span>
                    <span className={cn('rounded-full border px-2 py-px text-[9px] font-semibold uppercase tracking-wide', stateClass)}>
                      {assignment.state.replace(/_/g, ' ')}
                    </span>
                    {assignment.reviewRequired ? (
                      <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-px text-[9px] font-semibold uppercase tracking-wide text-violet-700">Review required</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--theme-muted-2)] break-words">{assignment.task}</p>
                  {assignment.rationale ? (
                    <p className="mt-1 text-[11px] text-[var(--theme-muted)]">Rationale: {assignment.rationale}</p>
                  ) : null}
                  {assignment.dependsOn.length > 0 ? (
                    <p className="mt-1 text-[11px] text-[var(--theme-muted)]">Depends on: {assignment.dependsOn.join(', ')}</p>
                  ) : null}
                  {assignment.blockerReason ? (
                    <p className="mt-1 text-[11px] text-[var(--theme-warning)]">Blocked: {assignment.blockerReason}</p>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
