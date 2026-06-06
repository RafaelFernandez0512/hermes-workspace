'use client'

import { useRef, useState } from 'react'
import type { TaskComment, TaskCommentAction } from '@/lib/tasks-api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

const ACTION_LABELS: Record<Exclude<TaskCommentAction, null>, string> = {
  approve: 'Approved',
  approve_and_requeue: 'Approved & Requeued',
  request_changes: 'Changes Requested',
  retry: 'Retried',
  reject: 'Rejected',
  system: 'System',
}

const ACTION_COLORS: Record<Exclude<TaskCommentAction, null>, string> = {
  approve: '#22c55e',
  approve_and_requeue: '#22c55e',
  request_changes: '#f97316',
  retry: '#3b82f6',
  reject: '#ef4444',
  system: '#6b7280',
}

type CommentsThreadProps = {
  comments: Array<TaskComment>
  isLoading: boolean
  isPending: boolean
  onAddComment: (body: string) => void
}

export function CommentsThread({
  comments,
  isLoading,
  isPending,
  onAddComment,
}: CommentsThreadProps) {
  const [commentText, setCommentText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-xs resize-none',
    'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
    'placeholder:text-[var(--theme-muted)]',
  )

  function submit() {
    if (!commentText.trim()) return
    onAddComment(commentText.trim())
    setCommentText('')
  }

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-3">
        Activity {comments.length > 0 && `· ${comments.length}`}
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-2.5 animate-pulse">
              <div className="w-7 h-7 rounded-full bg-[var(--theme-hover)] shrink-0" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="h-2.5 bg-[var(--theme-hover)] rounded w-24" />
                <div className="h-2 bg-[var(--theme-hover)] rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-[var(--theme-muted)] italic mb-3">
          No activity yet.
        </p>
      ) : (
        <div className="mb-3">
          {comments.map((comment, idx) => {
            const actionLabel = comment.action
              ? ACTION_LABELS[comment.action]
              : null
            const actionColor = comment.action
              ? ACTION_COLORS[comment.action]
              : null
            const isLast = idx === comments.length - 1

            return (
              <div
                key={comment.id}
                className={cn('flex gap-2.5', !isLast && 'pb-0')}
              >
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      background: 'var(--theme-hover)',
                      color: 'var(--theme-muted)',
                    }}
                  >
                    {comment.author.slice(0, 2).toUpperCase()}
                  </div>
                  {!isLast && (
                    <div
                      className="w-px flex-1 mt-1"
                      style={{ background: 'var(--theme-border)' }}
                    />
                  )}
                </div>
                <div
                  className={cn('flex-1 min-w-0', !isLast ? 'pb-4' : 'pb-2')}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[var(--theme-text)]">
                      {comment.author}
                    </span>
                    {actionLabel && actionColor && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          background: actionColor + '22',
                          color: actionColor,
                        }}
                      >
                        {actionLabel}
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--theme-muted)]">
                      {relativeTime(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--theme-text)] leading-relaxed whitespace-pre-wrap">
                    {comment.body}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="pt-1 border-t border-[var(--theme-border)]">
        <textarea
          ref={inputRef}
          className={cn(inputClass, 'mt-2')}
          rows={2}
          placeholder="Add a comment..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              (e.metaKey || e.ctrlKey) &&
              commentText.trim()
            ) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-[var(--theme-muted)]">
            ⌘↵ to submit
          </span>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !commentText.trim()}
            onClick={submit}
            style={{ background: 'var(--theme-accent)', color: 'white' }}
          >
            {isPending ? 'Adding...' : 'Comment'}
          </Button>
        </div>
      </div>
    </div>
  )
}
