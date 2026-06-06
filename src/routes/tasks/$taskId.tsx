import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTaskDetail } from '@/screens/_shared/detail/use-task-detail'
import { DetailHeader } from '@/screens/_shared/detail/DetailHeader'
import { BlockedBanner } from '@/screens/_shared/detail/BlockedBanner'
import { FinalResultSection } from '@/screens/_shared/detail/FinalResultSection'
import { CommentsThread } from '@/screens/_shared/detail/CommentsThread'
import { MetadataRow } from '@/screens/_shared/detail/MetadataRow'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'

export const Route = createFileRoute('/tasks/$taskId')({
  component: TaskDetailPage,
})

type DialogState = {
  open: boolean
  action: 'archive' | 'cancel' | null
}

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const {
    task,
    comments,
    isLoading,
    isPending,
    addComment,
    cancel,
    archive,
    approve,
    approveAndRequeue,
    requestChanges,
    reject,
    retry,
  } = useTaskDetail(taskId)

  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    action: null,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--theme-muted)] text-sm">
        Loading task...
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-[var(--theme-muted)] text-sm">Task not found.</p>
        <Link
          to="/tasks"
          className="text-xs text-[var(--theme-accent)] hover:underline"
        >
          ← Back to tasks
        </Link>
      </div>
    )
  }

  const isBlocked = task.column === 'blocked'
  const isTerminal = task.column === 'done' || task.column === 'deleted'

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-4">
        <Link
          to="/tasks"
          className="text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
        >
          ← Tasks
        </Link>
      </div>

      <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] overflow-hidden">
        {/* Accent top border */}
        <div
          className="h-[3px] w-full"
          style={{ background: isBlocked ? '#ef4444' : 'var(--theme-accent)' }}
        />

        <DetailHeader task={task} />

        <div className="px-5 py-4 space-y-4">
          <MetadataRow task={task} />

          {isBlocked && (
            <BlockedBanner
              blockedReason={task.blocked_reason}
              isPending={isPending}
              onApprove={approve}
              onApproveAndRequeue={approveAndRequeue}
              onRequestChanges={requestChanges}
              onRetry={retry}
              onReject={reject}
              onCancel={() => setDialog({ open: true, action: 'cancel' })}
            />
          )}

          <FinalResultSection latestRun={task.latestRun} />

          {!isTerminal && (
            <div className="pt-1 border-t border-[var(--theme-border)]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] mb-2 mt-2">
                Actions
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDialog({ open: true, action: 'archive' })}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--theme-hover)] disabled:opacity-50"
                  style={{ border: '1px solid #6b7280', color: '#6b7280' }}
                >
                  ↓ Archive
                </button>
                {!isBlocked && (
                  <button
                    type="button"
                    onClick={() => setDialog({ open: true, action: 'cancel' })}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--theme-hover)] disabled:opacity-50"
                    style={{ border: '1px solid #ef4444', color: '#ef4444' }}
                  >
                    ✕ Cancel Task
                  </button>
                )}
              </div>
            </div>
          )}

          <CommentsThread
            comments={comments}
            isLoading={isLoading}
            isPending={isPending}
            onAddComment={addComment}
          />
        </div>
      </div>

      <ConfirmActionDialog
        open={dialog.open}
        action={dialog.action ?? 'cancel'}
        requireReason={dialog.action === 'archive'}
        onConfirm={(_reason) => {
          if (dialog.action === 'archive') archive()
          else if (dialog.action === 'cancel') cancel()
          setDialog({ open: false, action: null })
        }}
        onCancel={() => setDialog({ open: false, action: null })}
      />
    </div>
  )
}
