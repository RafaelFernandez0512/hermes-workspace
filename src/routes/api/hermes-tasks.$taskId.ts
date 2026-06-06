import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { deleteTask, getTask, moveTask, updateTask } from '../../server/tasks-store'
import { addTaskComment, getTaskComments } from '../../server/task-comments-store'
import { appendLocalMessage, ensureLocalSession, getLocalMessages } from '../../server/local-session-store'
import { buildTaskRunRecapForSession } from '../../server/task-run-recap'
import { getSessionMessages } from '../../server/claude-dashboard-api'
import type { TaskColumn, TaskPriority } from '../../server/tasks-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isTaskColumn(value: unknown): value is TaskColumn {
  return (
    value === 'backlog' ||
    value === 'todo' ||
    value === 'in_progress' ||
    value === 'review' ||
    value === 'blocked' ||
    value === 'done' ||
    value === 'deleted'
  )
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return value === 'high' || value === 'medium' || value === 'low'
}

export const Route = createFileRoute('/api/hermes-tasks/$taskId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const task = getTask(params.taskId)
        if (!task) return jsonResponse({ error: 'Task not found' }, 404)
        const comments = getTaskComments(params.taskId)
        const latestRun = await buildTaskRunRecapForSession(task.session_id, params.taskId)
        return jsonResponse({ task: { ...task, latestRun }, comments })
      },

      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          const task = updateTask(params.taskId, {
            title: typeof body.title === 'string' ? body.title : undefined,
            description: typeof body.description === 'string' ? body.description : undefined,
            column: isTaskColumn(body.column) ? body.column : undefined,
            priority: isTaskPriority(body.priority) ? body.priority : undefined,
            assignee: body.assignee === null || typeof body.assignee === 'string' ? body.assignee : undefined,
            tags: Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
            due_date: body.due_date === null || typeof body.due_date === 'string' ? body.due_date : undefined,
            position: typeof body.position === 'number' ? body.position : undefined,
            session_id: body.session_id === null || typeof body.session_id === 'string' ? body.session_id : undefined,
            blocked_reason: body.blocked_reason === null || typeof body.blocked_reason === 'string' ? body.blocked_reason : undefined,
          })

          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          return jsonResponse({ task })
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },

      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const deleted = deleteTask(params.taskId)
        if (!deleted) return jsonResponse({ error: 'Task not found' }, 404)
        return jsonResponse({ ok: true })
      },

      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const action = url.searchParams.get('action') || 'move'

        // --- Approval / review actions ---

        if (action === 'approve') {
          const task = getTask(params.taskId)
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          const body = await request.json().catch(() => ({})) as Record<string, unknown>
          const author = typeof body.author === 'string' ? body.author : 'user'
          const note = typeof body.note === 'string' && body.note.trim() ? ` — ${body.note.trim()}` : ''
          const comment = addTaskComment({
            task_id: params.taskId,
            author,
            body: `Approved${note}`,
            action: 'approve',
          })
          return jsonResponse({ ok: true, comment, task })
        }

        if (action === 'approve-and-requeue') {
          const task = getTask(params.taskId)
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          const body = await request.json().catch(() => ({})) as Record<string, unknown>
          const author = typeof body.author === 'string' ? body.author : 'user'
          const note = typeof body.note === 'string' && body.note.trim() ? ` — ${body.note.trim()}` : ''
          const comment = addTaskComment({
            task_id: params.taskId,
            author,
            body: `Approved and requeued${note}`,
            action: 'approve_and_requeue',
          })
          const updated = moveTask(params.taskId, 'todo')
          if (!updated) return jsonResponse({ error: 'Task not found' }, 404)
          // Clear blocked_reason on requeue
          const cleared = updateTask(params.taskId, { blocked_reason: null })
          return jsonResponse({ ok: true, comment, task: cleared ?? updated })
        }

        if (action === 'request-changes') {
          const task = getTask(params.taskId)
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          const body = await request.json().catch(() => ({})) as Record<string, unknown>
          const author = typeof body.author === 'string' ? body.author : 'user'
          const commentBody = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : 'Changes requested'
          const comment = addTaskComment({
            task_id: params.taskId,
            author,
            body: commentBody,
            action: 'request_changes',
          })
          return jsonResponse({ ok: true, comment, task })
        }

        if (action === 'retry') {
          const task = getTask(params.taskId)
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          const body = await request.json().catch(() => ({})) as Record<string, unknown>
          const author = typeof body.author === 'string' ? body.author : 'user'
          addTaskComment({
            task_id: params.taskId,
            author,
            body: 'Retried — moved back to ready queue',
            action: 'retry',
          })
          const updated = moveTask(params.taskId, 'todo')
          if (!updated) return jsonResponse({ error: 'Task not found' }, 404)
          const cleared = updateTask(params.taskId, { blocked_reason: null })
          return jsonResponse({ ok: true, task: cleared ?? updated })
        }

        if (action === 'reject') {
          const task = getTask(params.taskId)
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          const body = await request.json().catch(() => ({})) as Record<string, unknown>
          const author = typeof body.author === 'string' ? body.author : 'user'
          const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : 'Rejected'
          addTaskComment({
            task_id: params.taskId,
            author,
            body: note,
            action: 'reject',
          })
          const updated = moveTask(params.taskId, 'backlog')
          if (!updated) return jsonResponse({ error: 'Task not found' }, 404)
          return jsonResponse({ ok: true, task: updated })
        }

        if (action === 'comment') {
          const task = getTask(params.taskId)
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          const body = await request.json().catch(() => ({})) as Record<string, unknown>
          if (typeof body.body !== 'string' || !body.body.trim()) {
            return jsonResponse({ error: 'comment body is required' }, 400)
          }
          const author = typeof body.author === 'string' ? body.author : 'user'
          const comment = addTaskComment({
            task_id: params.taskId,
            author,
            body: body.body.trim(),
            action: null,
          })
          return jsonResponse({ ok: true, comment })
        }

        // --- Launch action ---

        if (action === 'launch') {
          const task = getTask(params.taskId)
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)

          const sessionId = `task-${task.id.slice(0, 8)}-${randomUUID().slice(0, 8)}`

          let priorContext = ''
          if (task.session_id) {
            let tail: Array<{ role: string; content: string }> = []

            try {
              const dashResult = await getSessionMessages(task.session_id)
              if (dashResult.messages.length > 0) {
                tail = dashResult.messages
                  .filter((m) => m.role === 'user' || m.role === 'assistant')
                  .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
                  .slice(-20)
                  .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
              }
            } catch {
              // Dashboard unavailable — fall back to local store
            }

            if (tail.length === 0) {
              const localMsgs = getLocalMessages(task.session_id)
              tail = localMsgs
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .slice(-20)
                .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
            }

            if (tail.length > 0) {
              priorContext = `\n\n---\n**Prior session history** (session \`${task.session_id}\`, last ${tail.length} messages):\n${tail.map((m) => `[${m.role.toUpperCase()}] ${m.content.slice(0, 800)}`).join('\n\n')}\n---`
            }
          }

          const hasPrior = Boolean(task.session_id && priorContext)
          const briefing = [
            'You are picking up a task from the Hermes Workspace task board. Here is the full context:',
            '',
            `**Task:** ${task.title}`,
            `**Status:** ${task.column}  |  **Priority:** ${task.priority}  |  **Assignee:** ${task.assignee ?? 'Unassigned'}`,
            `**Tags:** ${task.tags.join(', ') || 'none'}  |  **Due:** ${task.due_date ?? 'none'}`,
            task.blocked_reason ? `**Blocked reason:** ${task.blocked_reason}` : '',
            '',
            '**Description:**',
            task.description || '(none)',
            priorContext,
            '',
            hasPrior
              ? 'This task has prior session history (shown above). Review it and give me a concise **current status** — what has been done, what is blocked, and the exact **next action** to move it forward.'
              : 'This is a fresh start on this task. Based on the title and description, give me a concise **current status** (what we know so far) and the exact **next action** to move it forward.',
            '',
            'Be direct and actionable. Start working immediately after your briefing.',
          ].join('\n')

          ensureLocalSession(sessionId)
          appendLocalMessage(sessionId, {
            id: randomUUID(),
            role: 'user',
            content: briefing,
            timestamp: Date.now(),
          })

          return jsonResponse({ sessionId, briefing, task: getTask(params.taskId) })
        }

        // --- Move action ---

        if (action !== 'move') {
          return jsonResponse({ error: `Unsupported action: ${action}` }, 400)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          if (typeof body.column !== 'string') {
            return jsonResponse({ error: 'column is required' }, 400)
          }
          const col = body.column as TaskColumn
          let blockedReason: string | null = null
          if (col === 'blocked' && typeof body.blocked_reason === 'string') {
            const trimmedBlockedReason = body.blocked_reason.trim()
            blockedReason = trimmedBlockedReason.length > 0 ? trimmedBlockedReason : null
          }
          const task = updateTask(params.taskId, { column: col, blocked_reason: blockedReason })
          if (!task) return jsonResponse({ error: 'Task not found' }, 404)
          return jsonResponse({ task })
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
