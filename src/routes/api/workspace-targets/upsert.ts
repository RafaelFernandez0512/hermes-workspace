import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import { upsertTarget } from '../../../server/workspace-targets/store'
import { WorkspaceTargetSchema } from '../../../server/workspace-targets/schema'

export const Route = createFileRoute('/api/workspace-targets/upsert')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const ctError = requireJsonContentType(request)
        if (ctError) return ctError

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = WorkspaceTargetSchema.safeParse(body)
        if (!parsed.success) {
          return json(
            { ok: false, error: 'Validation failed', issues: parsed.error.issues },
            { status: 422 },
          )
        }

        await upsertTarget(parsed.data)
        return json({ ok: true, target: parsed.data })
      },
    },
  },
})
