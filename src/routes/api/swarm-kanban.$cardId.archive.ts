import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { archiveKanbanCard } from '../../server/kanban-backend'
import { isLifecycleV2Enabled } from '../../lib/feature-flags'

export const Route = createFileRoute('/api/swarm-kanban/$cardId/archive')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        if (!isLifecycleV2Enabled()) {
          return json(
            { ok: false, error: 'HERMES_LIFECYCLE_V2 flag is not enabled' },
            { status: 503 },
          )
        }
        const cardId = params.cardId.trim()
        if (!cardId)
          return json({ ok: false, error: 'cardId required' }, { status: 400 })
        let body: Record<string, unknown> = {}
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          /* no body */
        }
        const actor = typeof body.actor === 'string' ? body.actor : 'user'
        const reason = typeof body.reason === 'string' ? body.reason : undefined
        try {
          const result = await archiveKanbanCard({ cardId, actor, reason })
          if (!result) {
            return json({ ok: false, error: 'Card not found' }, { status: 404 })
          }
          return json({ ok: true, ...result })
        } catch (err) {
          return json(
            { ok: false, error: err instanceof Error ? err.message : 'Failed' },
            { status: 400 },
          )
        }
      },
    },
  },
})
