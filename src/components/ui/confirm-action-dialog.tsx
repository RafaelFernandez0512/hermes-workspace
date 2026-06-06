'use client'

import { useState } from 'react'

type ActionKind =
  | 'archive'
  | 'unarchive'
  | 'delete'
  | 'cancel'
  | 'reject'
  | 'request-changes'

const ACTION_CONFIG: Record<
  ActionKind,
  { title: string; description: string; confirmLabel: string; color: string }
> = {
  archive: {
    title: 'Archive task',
    description:
      'This task will be moved to the archive. You can restore it later.',
    confirmLabel: 'Archive',
    color: '#6b7280',
  },
  unarchive: {
    title: 'Restore task',
    description: 'This task will be moved back to the active backlog.',
    confirmLabel: 'Restore',
    color: '#3b82f6',
  },
  delete: {
    title: 'Delete task',
    description: 'This action is permanent and cannot be undone.',
    confirmLabel: 'DELETE',
    color: '#ef4444',
  },
  cancel: {
    title: 'Cancel task',
    description: 'The task will be cancelled and moved to the deleted column.',
    confirmLabel: 'Cancel Task',
    color: '#ef4444',
  },
  reject: {
    title: 'Reject task',
    description: 'The task will be rejected and moved back to the backlog.',
    confirmLabel: 'Reject',
    color: '#ef4444',
  },
  'request-changes': {
    title: 'Request changes',
    description: 'Describe the changes needed for this task.',
    confirmLabel: 'Send Feedback',
    color: '#f97316',
  },
}

type ConfirmActionDialogProps = {
  open: boolean
  action: ActionKind
  requireReason?: boolean
  confirmText?: string
  onConfirm: (reason: string) => Promise<void> | void
  onCancel: () => void
}

export function ConfirmActionDialog({
  open,
  action,
  requireReason = false,
  confirmText,
  onConfirm,
  onCancel,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState('')
  const [confirmInput, setConfirmInput] = useState('')
  const [isPending, setIsPending] = useState(false)

  if (!open) return null

  const config = ACTION_CONFIG[action]
  const requiresConfirmText = Boolean(confirmText)
  const confirmTextMatch = !requiresConfirmText || confirmInput === confirmText
  const reasonOk = !requireReason || reason.trim().length > 0
  const canConfirm = reasonOk && confirmTextMatch && !isPending

  async function handleConfirm() {
    if (!canConfirm) return
    setIsPending(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setIsPending(false)
      setReason('')
      setConfirmInput('')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_55%,transparent)] px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-[var(--theme-text)]">
          {config.title}
        </h3>
        <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
          {config.description}
        </p>

        {requireReason && (
          <label className="mt-4 block space-y-1">
            <span className="text-xs font-medium text-[var(--theme-text)]">
              Reason <span className="text-red-400">*</span>
            </span>
            <textarea
              className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-input)] px-3 py-2 text-xs text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] resize-none placeholder:text-[var(--theme-muted)]"
              rows={3}
              placeholder="Enter a reason..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </label>
        )}

        {requiresConfirmText && (
          <label className="mt-3 block space-y-1">
            <span className="text-xs font-medium text-[var(--theme-text)]">
              Type <code className="text-red-400">{confirmText}</code> to
              confirm
            </span>
            <input
              className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-input)] px-3 py-2 text-xs text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] font-mono"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={confirmText}
            />
          </label>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-xl text-sm text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: config.color }}
          >
            {isPending ? 'Working...' : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
