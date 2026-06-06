import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  archiveMissionCascade,
  cleanupArchived,
  cleanupOrphans,
  dryRunCleanup,
} from '../../../server/lifecycle'
import { isLifecycleV2Enabled } from '../../../lib/feature-flags'
import { archiveStaleMissions } from '../../../server/swarm-missions'

function adminGuard(request: Request): Response | null {
  if (!isAuthenticated(request)) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (!isLifecycleV2Enabled()) {
    return json(
      { ok: false, error: 'HERMES_LIFECYCLE_V2 flag is not enabled' },
      { status: 503 },
    )
  }
  return null
}

export const Route = createFileRoute('/api/admin/cleanup')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const guard = adminGuard(request)
        if (guard) return guard
        const url = new URL(request.url)
        const action = url.searchParams.get('action') ?? 'dry-run'
        const dryRun =
          url.searchParams.get('dryRun') === 'true' || action === 'dry-run'

        if (dryRun || action === 'dry-run') {
          return json({ ok: true, ...dryRunCleanup() })
        }

        return json({ ok: true, ...dryRunCleanup() })
      },
      POST: async ({ request }): Promise<Response> => {
        const guard = adminGuard(request)
        if (guard) return guard

        let body: Record<string, unknown> = {}
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 },
          )
        }

        const url = new URL(request.url)
        const action =
          typeof body.action === 'string'
            ? body.action
            : (url.searchParams.get('action') ?? '')
        const dryRun =
          body.dryRun === true || url.searchParams.get('dryRun') === 'true'
        const actor =
          typeof body.actor === 'string' && body.actor.trim()
            ? body.actor.trim()
            : 'admin-cleanup'
        const olderThanHours =
          typeof body.olderThanHours === 'number' ? body.olderThanHours : null
        const olderThanMs = olderThanHours
          ? olderThanHours * 3600 * 1000
          : undefined

        if (action === 'dry-run' || dryRun) {
          return json({ ok: true, ...dryRunCleanup() })
        }

        if (action === 'orphans') {
          const result = cleanupOrphans({ actor })
          return json({
            ok: true,
            action,
            dryRun: false,
            deletedCardIds: result.deletedCardIds,
            count: result.count,
          })
        }

        if (action === 'archived') {
          const result = cleanupArchived({ actor, olderThanMs })
          return json({
            ok: true,
            action,
            dryRun: false,
            deletedMissionIds: result.deletedMissionIds,
            deletedCardIds: result.deletedCardIds,
            count: result.count,
          })
        }

        if (action === 'stale-sessions') {
          const staleMs =
            typeof body.staleHours === 'number'
              ? body.staleHours * 3600 * 1000
              : 6 * 3600 * 1000
          const result = archiveStaleMissions(staleMs)
          return json({
            ok: true,
            action,
            dryRun: false,
            archivedIds: result.archivedIds,
            count: result.count,
          })
        }

        return json(
          {
            ok: false,
            error: `Unknown action: ${action}. Use dry-run, orphans, archived, or stale-sessions.`,
          },
          { status: 400 },
        )
      },
    },
  },
})
