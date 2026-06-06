import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClaudeTask, TaskComment } from '@/lib/tasks-api'
import { fetchTaskDetails, performApprovalAction } from '@/lib/tasks-api'
import { toast } from '@/components/ui/toast'

export type UseTaskDetailResult = {
  task: ClaudeTask | null
  comments: Array<TaskComment>
  isLoading: boolean
  addComment: (body: string) => void
  cancel: () => void
  archive: () => void
  unarchive: () => void
  approve: (note?: string) => void
  approveAndRequeue: (note?: string) => void
  requestChanges: (note: string) => void
  reject: (note?: string) => void
  retry: () => void
  isPending: boolean
}

export function useTaskDetail(
  taskId: string | null | undefined,
  enabled = true,
): UseTaskDetailResult {
  const queryClient = useQueryClient()
  const queryKey = ['hermes-task', taskId]

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchTaskDetails(taskId!, signal),
    enabled: Boolean(taskId) && enabled,
    refetchInterval: 15_000,
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey })
    void queryClient.invalidateQueries({ queryKey: ['hermes-tasks'] })
  }

  const actionMutation = useMutation({
    mutationFn: ({
      action,
      note,
    }: {
      action: Parameters<typeof performApprovalAction>[1]
      note?: string
    }) => performApprovalAction(taskId!, action, { note }),
    onSuccess: (_, { action }) => {
      invalidate()
      const labels: Record<string, string> = {
        approve: 'Task approved',
        'approve-and-requeue': 'Approved and requeued',
        'request-changes': 'Changes requested',
        retry: 'Task requeued',
        reject: 'Task rejected',
        cancel: 'Task cancelled',
        archive: 'Task archived',
        comment: 'Comment added',
      }
      toast(labels[action] ?? 'Done')
    },
    onError: (e) =>
      toast(e instanceof Error ? e.message : 'Action failed', {
        type: 'error',
      }),
  })

  const data = query.data

  return {
    task: data?.task ?? null,
    comments: data?.comments ?? [],
    isLoading: query.isLoading,
    isPending: actionMutation.isPending,
    addComment: (body) =>
      actionMutation.mutate({ action: 'comment', note: body }),
    cancel: () => actionMutation.mutate({ action: 'cancel' }),
    archive: () => actionMutation.mutate({ action: 'archive' }),
    unarchive: () => actionMutation.mutate({ action: 'approve' }),
    approve: (note) => actionMutation.mutate({ action: 'approve', note }),
    approveAndRequeue: (note) =>
      actionMutation.mutate({ action: 'approve-and-requeue', note }),
    requestChanges: (note) =>
      actionMutation.mutate({ action: 'request-changes', note }),
    reject: (note) => actionMutation.mutate({ action: 'reject', note }),
    retry: () => actionMutation.mutate({ action: 'retry' }),
  }
}
