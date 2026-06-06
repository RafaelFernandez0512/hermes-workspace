import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { archiveMissionCascade, unarchiveMission } from '../../server/lifecycle'
import { isLifecycleV2Enabled } from '../../lib/feature-flags'

export const Route = createFileRoute('/api/swarm-missions/$missionId/archive')({
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
        const reason = typeof body.reason === 'string' ? body.reason : undefined
        const cascade = body.cascade !== false
        try {
          const result =
            cascade && isLifecycleV2Enabled()
              ? archiveMissionCascade({ missionId, actor, reason })
              : { missionId, archivedCardIds: [], changed: true }
          if (!cascade || !isLifecycleV2Enabled()) {
            const { archiveSwarmMission } =
              await import('../../server/swarm-missions')
            const r = archiveSwarmMission({ missionId, actor, reason })
            if (!r)
              return json(
                { ok: false, error: 'Mission not found' },
                { status: 404 },
              )
            return json({
              ok: true,
              missionId,
              changed: r.changed,
              archivedCardIds: [],
            })
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
