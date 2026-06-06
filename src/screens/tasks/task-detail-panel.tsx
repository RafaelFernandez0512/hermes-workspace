'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ApprovalAction,
  ClaudeTask,
  TaskComment,
  TaskCommentAction,
  TaskLatestRun,
} from '@/lib/tasks-api'
import {
  COLUMN_COLORS,
  COLUMN_LABELS,
  PRIORITY_COLORS,
  fetchTaskDetails,
  isOverdue,
  performApprovalAction,
} from '@/lib/tasks-api'
import {
  DialogContent,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

// --- helpers ---

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

// --- sub-components ---

function StatusBadge({ column }: { column: ClaudeTask['column'] }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: COLUMN_COLORS[column] + '22', color: COLUMN_COLORS[column], border: `1px solid ${COLUMN_COLORS[column]}55` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLUMN_COLORS[column] }} />
      {COLUMN_LABELS[column]}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: ClaudeTask['priority'] }) {
  const color = PRIORITY_COLORS[priority]
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: color + '22', color, border: `1px solid ${color}55` }}
    >
      {priority}
    </span>
  )
}

function AuditBadge({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]"
      title={`${label}: ${value}`}
    >
      <span className="uppercase tracking-wider font-semibold">{label}</span>
      <span className="font-mono text-[10px] text-[var(--theme-text)]">{value}</span>
    </span>
  )
}

function CommentItem({ comment }: { comment: TaskComment }) {
  const actionLabel = comment.action ? ACTION_LABELS[comment.action] : null
  const actionColor = comment.action ? ACTION_COLORS[comment.action] : null

  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center shrink-0">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: 'var(--theme-hover)', color: 'var(--theme-muted)' }}
        >
          {comment.author.slice(0, 2).toUpperCase()}
        </div>
        <div className="w-px flex-1 mt-1" style={{ background: 'var(--theme-border)' }} />
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[var(--theme-text)]">{comment.author}</span>
          {actionLabel && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: actionColor + '22', color: actionColor ?? undefined }}
            >
              {actionLabel}
            </span>
          )}
          <span className="text-[10px] text-[var(--theme-muted)]">{relativeTime(comment.created_at)}</span>
        </div>
        <p className="text-xs text-[var(--theme-text)] leading-relaxed whitespace-pre-wrap">{comment.body}</p>
      </div>
    </div>
  )
}

function humanizeKey(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatRunValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => formatRunValue(item))
      .filter(Boolean)
      .join(', ')
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function collectRunActivities(run: TaskLatestRun | null | undefined): Array<string> {
  if (!run) return []
  if (Array.isArray(run.activities) && run.activities.length > 0) return run.activities
  if (!run.metadata || typeof run.metadata !== 'object') return []
  return Object.entries(run.metadata)
    .map(([key, value]) => {
      const formatted = formatRunValue(value).trim()
      return formatted ? `${humanizeKey(key)}: ${formatted}` : null
    })
    .filter((item): item is string => Boolean(item))
}

// --- main component ---

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: ClaudeTask | null
  onEdit: (task: ClaudeTask) => void
  onTaskUpdated: () => void
}

export function TaskDetailPanel({ open, onOpenChange, task, onEdit, onTaskUpdated }: Props) {
  const queryClient = useQueryClient()
  const [commentText, setCommentText] = useState('')
  const [showRequestChanges, setShowRequestChanges] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  const detailKey = ['task-detail', task?.id]

  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => fetchTaskDetails(task!.id, signal),
    enabled: open && task !== null,
    refetchInterval: 15_000,
  })

  const details = detailQuery.data
  const liveTask = details?.task ?? task
  const comments = details?.comments ?? []

  useEffect(() => {
    if (!open) {
      setCommentText('')
      setActionNote('')
      setShowRequestChanges(false)
      setShowReject(false)
    }
  }, [open])

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: detailKey })
    onTaskUpdated()
  }

  const actionMutation = useMutation({
    mutationFn: ({ action, note }: { action: ApprovalAction; note?: string }) =>
      performApprovalAction(task!.id, action, { note }),
    onSuccess: (_, { action }) => {
      invalidateAll()
      const labels: Record<ApprovalAction, string> = {
        approve: 'Task approved',
        'approve-and-requeue': 'Approved and requeued',
        'request-changes': 'Changes requested',
        retry: 'Task requeued for retry',
        reject: 'Task rejected',
        comment: 'Comment added',
      }
      toast(labels[action])
      setActionNote('')
      setShowRequestChanges(false)
      setShowReject(false)
      if (action === 'approve-and-requeue' || action === 'retry' || action === 'reject') {
        onOpenChange(false)
      }
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Action failed', { type: 'error' }),
  })

  const commentMutation = useMutation({
    mutationFn: (body: string) => performApprovalAction(task!.id, 'comment', { note: body }),
    onSuccess: () => {
      invalidateAll()
      setCommentText('')
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Failed to add comment', { type: 'error' }),
  })

  if (!task) return null

  const isBlocked = liveTask?.column === 'blocked'
  const blockedReason = liveTask?.blocked_reason
  const overdue = liveTask ? isOverdue(liveTask) : false
  const latestRun = liveTask?.latestRun ?? null
  const runActivities = collectRunActivities(latestRun)

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-xs',
    'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
    'placeholder:text-[var(--theme-muted)]',
  )

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(680px,96vw)] max-h-[90vh] border-[var(--theme-border)] bg-[var(--theme-bg)] overflow-hidden flex flex-col">
        {/* Accent top border — red for blocked, normal for others */}
        <div
          className="h-[3px] w-full shrink-0"
          style={{ background: isBlocked ? '#ef4444' : 'var(--theme-accent)' }}
        />

        <div className="flex flex-col overflow-hidden flex-1">
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-[var(--theme-border)] shrink-0">
            <div className="flex items-start justify-between gap-3 mb-2">
              <DialogTitle className="text-base font-semibold text-[var(--theme-text)] leading-snug flex-1 min-w-0">
                {liveTask?.title ?? task.title}
              </DialogTitle>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(liveTask ?? task)}
                  className="text-xs"
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="text-xs"
                >
                  ✕
                </Button>
              </div>
            </div>

            {/* Metadata row */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge column={liveTask?.column ?? task.column} />
              <PriorityBadge priority={liveTask?.priority ?? task.priority} />
              {(liveTask?.assignee ?? task.assignee) && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]">
                  {liveTask?.assignee ?? task.assignee}
                </span>
              )}
              {(liveTask?.due_date ?? task.due_date) && (
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full',
                  overdue
                    ? 'bg-red-500/15 text-red-400 font-semibold'
                    : 'bg-[var(--theme-hover)] text-[var(--theme-muted)]',
                )}>
                  {overdue ? '⚠ Overdue · ' : ''}
                  {(() => {
                    const d = liveTask?.due_date ?? task.due_date
                    if (!d) return ''
                    const [y, m, day] = d.split('-').map(Number)
                    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  })()}
                </span>
              )}
              {(liveTask?.tags ?? task.tags).slice(0, 3).map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]">{tag}</span>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">Audit</span>
              <AuditBadge label="Task ID" value={liveTask?.id ?? task.id} />
              <AuditBadge label="Session ID" value={liveTask?.session_id ?? task.session_id ?? 'not linked'} />
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Description */}
            {(liveTask?.description ?? task.description) && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-1">Description</p>
                <p className="text-sm text-[var(--theme-text)] leading-relaxed whitespace-pre-wrap">
                  {liveTask?.description ?? task.description}
                </p>
              </div>
            )}

            {/* Blocked callout */}
            {isBlocked && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  <p className="text-sm font-semibold text-red-400">Task is blocked</p>
                </div>
                {blockedReason ? (
                  <p className="text-xs text-[var(--theme-text)] leading-relaxed mb-3 whitespace-pre-wrap">{blockedReason}</p>
                ) : (
                  <p className="text-xs text-[var(--theme-muted)] mb-3 italic">No reason specified</p>
                )}

                {/* Approval actions */}
                {!showRequestChanges && !showReject && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => actionMutation.mutate({ action: 'approve' })}
                      disabled={actionMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: '#22c55e' }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => actionMutation.mutate({ action: 'approve-and-requeue' })}
                      disabled={actionMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: '#16a34a' }}
                    >
                      ✓ Approve & Requeue
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRequestChanges(true)}
                      disabled={actionMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--theme-hover)] disabled:opacity-50"
                      style={{ border: '1px solid #f97316', color: '#f97316' }}
                    >
                      ✎ Request Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => actionMutation.mutate({ action: 'retry' })}
                      disabled={actionMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--theme-hover)] disabled:opacity-50"
                      style={{ border: '1px solid #3b82f6', color: '#3b82f6' }}
                    >
                      ↺ Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReject(true)}
                      disabled={actionMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--theme-hover)] disabled:opacity-50"
                      style={{ border: '1px solid #ef4444', color: '#ef4444' }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}

                {/* Request Changes inline form */}
                {showRequestChanges && (
                  <div className="space-y-2 mt-2">
                    <textarea
                      className={cn(inputClass, 'resize-none')}
                      rows={3}
                      placeholder="Describe what needs to change..."
                      value={actionNote}
                      onChange={e => setActionNote(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => actionMutation.mutate({ action: 'request-changes', note: actionNote })}
                        disabled={actionMutation.isPending || !actionNote.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: '#f97316' }}
                      >
                        {actionMutation.isPending ? 'Sending...' : 'Send Feedback'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowRequestChanges(false); setActionNote('') }}
                        className="px-3 py-1.5 rounded-lg text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Reject inline form */}
                {showReject && (
                  <div className="space-y-2 mt-2">
                    <textarea
                      className={cn(inputClass, 'resize-none')}
                      rows={2}
                      placeholder="Reason for rejection (optional)..."
                      value={actionNote}
                      onChange={e => setActionNote(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => actionMutation.mutate({ action: 'reject', note: actionNote || 'Rejected' })}
                        disabled={actionMutation.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: '#ef4444' }}
                      >
                        {actionMutation.isPending ? 'Rejecting...' : 'Confirm Reject'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowReject(false); setActionNote('') }}
                        className="px-3 py-1.5 rounded-lg text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Run recap */}
            <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">Run recap</p>
                {latestRun?.outcome ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]">
                    Outcome: {latestRun.outcome}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-1">Final result</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--theme-text)]">
                    {latestRun?.summary?.trim() || 'No final result recorded yet.'}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-2">Activity</p>
                  {runActivities.length > 0 ? (
                    <ul className="space-y-2 text-xs text-[var(--theme-text)]">
                      {runActivities.map((activity, index) => (
                        <li key={`${activity}-${index}`} className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 leading-relaxed whitespace-pre-wrap">
                          {activity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--theme-muted)] italic">No activity recorded yet.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Comments timeline */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-3">
                Activity {comments.length > 0 && `· ${comments.length}`}
              </p>

              {detailQuery.isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => (
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
                <p className="text-xs text-[var(--theme-muted)] italic">No activity yet.</p>
              ) : (
                <div>
                  {comments.map((comment, idx) => (
                    <div key={comment.id} style={{ position: 'relative' }}>
                      {idx === comments.length - 1 ? (
                        // Last comment: no trailing line
                        <div className="flex gap-2.5 pb-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{ background: 'var(--theme-hover)', color: 'var(--theme-muted)' }}
                          >
                            {comment.author.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-[var(--theme-text)]">{comment.author}</span>
                              {comment.action && (
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                  style={{
                                    background: ACTION_COLORS[comment.action] + '22',
                                    color: ACTION_COLORS[comment.action],
                                  }}
                                >
                                  {ACTION_LABELS[comment.action]}
                                </span>
                              )}
                              <span className="text-[10px] text-[var(--theme-muted)]">{relativeTime(comment.created_at)}</span>
                            </div>
                            <p className="text-xs text-[var(--theme-text)] leading-relaxed whitespace-pre-wrap">{comment.body}</p>
                          </div>
                        </div>
                      ) : (
                        <CommentItem comment={comment} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add comment */}
            <div className="pt-1 border-t border-[var(--theme-border)]">
              <textarea
                ref={commentInputRef}
                className={cn(inputClass, 'resize-none mt-2')}
                rows={2}
                placeholder="Add a comment..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && commentText.trim()) {
                    e.preventDefault()
                    commentMutation.mutate(commentText.trim())
                  }
                }}
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-[var(--theme-muted)]">⌘↵ to submit</span>
                <Button
                  type="button"
                  size="sm"
                  disabled={commentMutation.isPending || !commentText.trim()}
                  onClick={() => commentMutation.mutate(commentText.trim())}
                  style={{ background: 'var(--theme-accent)', color: 'white' }}
                >
                  {commentMutation.isPending ? 'Adding...' : 'Comment'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
