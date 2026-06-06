'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type RejectMode = 'retry' | 'skip' | 'terminate'

type BlockBannerProps = {
  blocker: string | null
  missionId: string
  assignmentId: string
  onApprove: () => void
  onReject: (feedback: string, mode: RejectMode) => void
  isApproving?: boolean
  isRejecting?: boolean
}

export function BlockBanner({ blocker, onApprove, onReject, isApproving, isRejecting }: BlockBannerProps) {
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [rejectMode, setRejectMode] = useState<RejectMode>('retry')

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        onApprove()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onApprove])

  return (
    <div
      className={cn(
        'shrink-0 border-b border-[var(--theme-warning-border)] px-4 py-3',
        'bg-[var(--theme-warning-soft)]',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--theme-warning)]">Blocked</span>
        <span className="flex-1" />
        {!showRejectForm ? (
          <>
            <button
              type="button"
              onClick={() => setShowRejectForm(true)}
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1 text-xs font-semibold text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={isApproving}
              title="Approve (⌘↵)"
              className="rounded-lg bg-[var(--theme-accent)] px-3 py-1 text-xs font-semibold text-primary-950 hover:bg-[var(--theme-accent-strong)] disabled:opacity-60"
            >
              {isApproving ? 'Approving…' : 'Approve ⌘↵'}
            </button>
          </>
        ) : null}
      </div>

      {blocker ? (
        <pre className="mb-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--theme-warning-border)] bg-[var(--theme-card)] p-2 text-[11px] text-[var(--theme-text)]">
          {blocker}
        </pre>
      ) : null}

      {showRejectForm ? (
        <div className="mt-2 space-y-2">
          <div className="flex gap-3 text-xs">
            {(['retry', 'skip', 'terminate'] as RejectMode[]).map((mode) => (
              <label key={mode} className="flex cursor-pointer items-center gap-1 text-[var(--theme-muted)]">
                <input
                  type="radio"
                  name="rejectMode"
                  value={mode}
                  checked={rejectMode === mode}
                  onChange={() => setRejectMode(mode)}
                />
                <span className="capitalize">{mode}</span>
              </label>
            ))}
          </div>
          <textarea
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Feedback (required)"
            className="w-full resize-none rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-xs text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowRejectForm(false); setFeedback('') }}
              className="rounded-lg border border-[var(--theme-border)] px-3 py-1 text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!feedback.trim() || isRejecting}
              onClick={() => { if (feedback.trim()) onReject(feedback.trim(), rejectMode) }}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-60',
                rejectMode === 'terminate'
                  ? 'bg-[var(--theme-danger)] text-white'
                  : 'bg-[var(--theme-accent)] text-primary-950',
              )}
            >
              {isRejecting ? 'Rejecting…' : `Reject (${rejectMode})`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
