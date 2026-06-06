'use client'

import type { ClaudeTask } from '@/lib/tasks-api'
import { isOverdue } from '@/lib/tasks-api'
import { cn } from '@/lib/utils'

type MetadataRowProps = {
  task: ClaudeTask
}

export function MetadataRow({ task }: MetadataRowProps) {
  const overdue = isOverdue(task)

  if (!task.description && !task.due_date && !task.blocked_reason) return null

  return (
    <div className="space-y-2">
      {task.description && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-1">
            Description
          </p>
          <p className="text-sm text-[var(--theme-text)] leading-relaxed whitespace-pre-wrap">
            {task.description}
          </p>
        </div>
      )}

      {task.due_date && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">
            Due
          </span>
          <span
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full',
              overdue
                ? 'bg-red-500/15 text-red-400 font-semibold'
                : 'bg-[var(--theme-hover)] text-[var(--theme-muted)]',
            )}
          >
            {overdue ? '⚠ Overdue · ' : ''}
            {(() => {
              const [y, m, d] = task.due_date.split('-').map(Number)
              return new Date(y, m - 1, d).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            })()}
          </span>
        </div>
      )}
    </div>
  )
}
