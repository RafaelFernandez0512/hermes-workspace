'use client'

import type { ClaudeTask } from '@/lib/tasks-api'
import { COLUMN_COLORS, COLUMN_LABELS, PRIORITY_COLORS } from '@/lib/tasks-api'
import { cn } from '@/lib/utils'

function StatusBadge({ column }: { column: ClaudeTask['column'] }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: COLUMN_COLORS[column] + '22',
        color: COLUMN_COLORS[column],
        border: `1px solid ${COLUMN_COLORS[column]}55`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: COLUMN_COLORS[column] }}
      />
      {COLUMN_LABELS[column]}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: ClaudeTask['priority'] }) {
  const color = PRIORITY_COLORS[priority]
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{
        background: color + '22',
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {priority}
    </span>
  )
}

type DetailHeaderProps = {
  task: ClaudeTask
  onClose?: () => void
  onEdit?: (task: ClaudeTask) => void
}

export function DetailHeader({ task, onClose, onEdit }: DetailHeaderProps) {
  return (
    <div className="px-5 pt-4 pb-3 border-b border-[var(--theme-border)] shrink-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="text-base font-semibold text-[var(--theme-text)] leading-snug flex-1 min-w-0">
          {task.title}
        </h2>
        <div className="flex gap-1.5 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="text-xs px-2 py-1 rounded hover:bg-[var(--theme-hover)] text-[var(--theme-muted)] transition-colors"
            >
              Edit
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-2 py-1 rounded hover:bg-[var(--theme-hover)] text-[var(--theme-muted)] transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge column={task.column} />
        <PriorityBadge priority={task.priority} />
        {task.assignee && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]">
            {task.assignee}
          </span>
        )}
        {task.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">
          Audit
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]"
          title={`Task ID: ${task.id}`}
        >
          <span className="uppercase tracking-wider font-semibold">
            Task ID
          </span>
          <span className="font-mono text-[10px] text-[var(--theme-text)]">
            {task.id}
          </span>
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]"
          title={`Session: ${task.session_id ?? 'none'}`}
        >
          <span className="uppercase tracking-wider font-semibold">
            Session
          </span>
          <span className="font-mono text-[10px] text-[var(--theme-text)]">
            {task.session_id ?? 'No session linked yet'}
          </span>
        </span>
      </div>
    </div>
  )
}
