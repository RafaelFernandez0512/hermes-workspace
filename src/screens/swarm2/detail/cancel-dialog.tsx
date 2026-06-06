'use client'

import { useState } from 'react'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { cn } from '@/lib/utils'

type CancelDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  missionTitle: string
  agentCount: number
  filesChangedCount: number
  onConfirm: (options: { graceful: boolean; discardChanges: boolean }) => void
  isLoading?: boolean
}

export function CancelDialog({
  open,
  onOpenChange,
  missionTitle,
  agentCount,
  filesChangedCount,
  onConfirm,
  isLoading,
}: CancelDialogProps) {
  const [graceful, setGraceful] = useState(true)
  const [discardChanges, setDiscardChanges] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const needsDoubleConfirm = discardChanges && !confirmDiscard

  function handleConfirm() {
    if (needsDoubleConfirm) {
      setConfirmDiscard(true)
      return
    }
    onConfirm({ graceful, discardChanges })
  }

  return (
    <AlertDialogRoot open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(480px,92vw)]">
        <div className="p-5">
          <AlertDialogTitle className="text-base font-semibold text-[var(--theme-text)]">
            Cancel mission?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-1 text-sm text-[var(--theme-muted)]">
            Cancelling <span className="font-semibold text-[var(--theme-text)]">{missionTitle}</span>
            {agentCount > 0 ? ` — ${agentCount} agent${agentCount !== 1 ? 's' : ''} running` : ''}
            {filesChangedCount > 0 ? `, ${filesChangedCount} file${filesChangedCount !== 1 ? 's' : ''} modified` : ''}.
          </AlertDialogDescription>

          <div className="mt-4 space-y-3">
            <fieldset className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
              <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-[var(--theme-muted)]">Stop mode</legend>
              <div className="space-y-2 mt-2">
                {[
                  { value: true, label: 'Graceful (recommended, ~30s)', desc: 'Sends Ctrl-C and waits for the worker to finish its current step.' },
                  { value: false, label: 'Force stop (immediate)', desc: 'Kills the tmux session immediately. Work in progress may be lost.' },
                ].map((opt) => (
                  <label key={String(opt.value)} className="flex cursor-pointer items-start gap-3">
                    <input type="radio" name="graceful" checked={graceful === opt.value} onChange={() => setGraceful(opt.value)} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[var(--theme-text)]">{opt.label}</div>
                      <div className="text-[11px] text-[var(--theme-muted)]">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
              <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-[var(--theme-muted)]">Changes</legend>
              <div className="space-y-2 mt-2">
                {[
                  { value: false, label: 'Keep all changes', desc: 'Files modified by workers are preserved on disk.' },
                  { value: true, label: 'Discard all changes', desc: 'Runs git checkout on each file touched by workers.' },
                ].map((opt) => (
                  <label key={String(opt.value)} className="flex cursor-pointer items-start gap-3">
                    <input type="radio" name="discard" checked={discardChanges === opt.value} onChange={() => { setDiscardChanges(opt.value); setConfirmDiscard(false) }} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[var(--theme-text)]">{opt.label}</div>
                      <div className="text-[11px] text-[var(--theme-muted)]">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            {discardChanges && confirmDiscard ? (
              <div className="rounded-xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-3 py-2 text-sm text-[var(--theme-danger)]">
                All modified files will be reset with <code>git checkout</code>. This cannot be undone.
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogCancel onClick={() => onOpenChange(false)}>
              Keep running
            </AlertDialogCancel>
            <AlertDialog.Close
              render={
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleConfirm}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60',
                    discardChanges && confirmDiscard
                      ? 'bg-[var(--theme-danger)] text-white'
                      : 'bg-[var(--theme-accent)] text-primary-950',
                  )}
                />
              }
            >
              {isLoading
                ? 'Cancelling…'
                : needsDoubleConfirm
                  ? 'Confirm discard'
                  : 'Cancel mission'}
            </AlertDialog.Close>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}
