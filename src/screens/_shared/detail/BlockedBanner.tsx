'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

type BlockedBannerProps = {
  blockedReason?: string | null
  isPending: boolean
  onApprove: () => void
  onApproveAndRequeue: () => void
  onRequestChanges: (note: string) => void
  onRetry: () => void
  onReject: (note?: string) => void
  onCancel: () => void
}

export function BlockedBanner({
  blockedReason,
  isPending,
  onApprove,
  onApproveAndRequeue,
  onRequestChanges,
  onRetry,
  onReject,
  onCancel,
}: BlockedBannerProps) {
  const [showRequestChanges, setShowRequestChanges] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [actionNote, setActionNote] = useState('')

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-xs resize-none',
    'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
    'placeholder:text-[var(--theme-muted)]',
  )

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
        <p className="text-sm font-semibold text-red-400">Task is blocked</p>
      </div>
      {blockedReason ? (
        <p className="text-xs text-[var(--theme-text)] leading-relaxed mb-3 whitespace-pre-wrap">
          {blockedReason}
        </p>
      ) : (
        <p className="text-xs text-[var(--theme-muted)] mb-3 italic">
          Blocked reason not recorded.
        </p>
      )}

      {!showRequestChanges && !showReject && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#22c55e' }}
          >
            ✓ Approve
          </button>
          <button
            type="button"
            onClick={onApproveAndRequeue}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#16a34a' }}
          >
            ✓ Approve & Requeue
          </button>
          <button
            type="button"
            onClick={() => setShowRequestChanges(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--theme-hover)] disabled:opacity-50"
            style={{ border: '1px solid #f97316', color: '#f97316' }}
          >
            ✎ Request Changes
          </button>
          <button
            type="button"
            onClick={onRetry}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--theme-hover)] disabled:opacity-50"
            style={{ border: '1px solid #3b82f6', color: '#3b82f6' }}
          >
            ↺ Retry
          </button>
          <button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--theme-hover)] disabled:opacity-50"
            style={{ border: '1px solid #ef4444', color: '#ef4444' }}
          >
            ✕ Reject
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--theme-hover)] disabled:opacity-50"
            style={{ border: '1px solid #6b7280', color: '#6b7280' }}
          >
            ✕ Cancel
          </button>
        </div>
      )}

      {showRequestChanges && (
        <div className="space-y-2 mt-2">
          <textarea
            className={inputClass}
            rows={3}
            placeholder="Describe what needs to change..."
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onRequestChanges(actionNote)
                setShowRequestChanges(false)
                setActionNote('')
              }}
              disabled={isPending || !actionNote.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: '#f97316' }}
            >
              {isPending ? 'Sending...' : 'Send Feedback'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRequestChanges(false)
                setActionNote('')
              }}
              className="px-3 py-1.5 rounded-lg text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showReject && (
        <div className="space-y-2 mt-2">
          <textarea
            className={inputClass}
            rows={2}
            placeholder="Reason for rejection (optional)..."
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onReject(actionNote || 'Rejected')
                setShowReject(false)
                setActionNote('')
              }}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: '#ef4444' }}
            >
              {isPending ? 'Rejecting...' : 'Confirm Reject'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReject(false)
                setActionNote('')
              }}
              className="px-3 py-1.5 rounded-lg text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
