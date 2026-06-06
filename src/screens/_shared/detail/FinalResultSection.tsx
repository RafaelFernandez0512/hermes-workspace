'use client'

import type { TaskLatestRun } from '@/lib/tasks-api'

function humanizeKey(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatRunValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (Array.isArray(value))
    return value.map(formatRunValue).filter(Boolean).join(', ')
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function collectRunActivities(
  run: TaskLatestRun | null | undefined,
): Array<string> {
  if (!run) return []
  if (Array.isArray(run.activities) && run.activities.length > 0)
    return run.activities
  if (!run.metadata || typeof run.metadata !== 'object') return []
  return Object.entries(run.metadata)
    .map(([key, value]) => {
      const formatted = formatRunValue(value).trim()
      return formatted ? `${humanizeKey(key)}: ${formatted}` : null
    })
    .filter((item): item is string => Boolean(item))
}

type FinalResultSectionProps = {
  latestRun?: TaskLatestRun | null
}

export function FinalResultSection({ latestRun }: FinalResultSectionProps) {
  const activities = collectRunActivities(latestRun)

  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">
          Run recap
        </p>
        {latestRun?.outcome ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]">
            Outcome: {latestRun.outcome}
          </span>
        ) : null}
      </div>
      <div className="mt-3 space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-1">
            Final result
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--theme-text)]">
            {latestRun?.summary?.trim() || 'No final result recorded yet.'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-2">
            Activity
          </p>
          {activities.length > 0 ? (
            <ul className="space-y-2 text-xs text-[var(--theme-text)]">
              {activities.map((activity, index) => (
                <li
                  key={`${activity}-${index}`}
                  className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 leading-relaxed whitespace-pre-wrap"
                >
                  {activity}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--theme-muted)] italic">
              No activity recorded yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
