import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { unarchiveMission } from '../../server/lifecycle'

export const Route = createFileRoute(
  '/api/swarm-missions/$missionId/unarchive',
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const missionId = params.missionId.trim()
        if (!missionId)
          return json(
            { ok: false, error: 'missionId required' },
            { status: 400 },
          )
        let body: Record<string, unknown> = {}
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          /* no body */
        }
        const actor = typeof body.actor === 'string' ? body.actor : 'user'
        try {
          const result = unarchiveMission({ missionId, actor })
          return json({ ok: true, ...result })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : 'Mission not found',
            },
            { status: 404 },
          )
        }
      },
    },
  },
})
