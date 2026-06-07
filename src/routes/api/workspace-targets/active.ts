import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import { getActiveTargetId, setActiveTargetId } from '../../../server/workspace-targets/store'

export const Route = createFileRoute('/api/workspace-targets/active')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const activeTargetId = await getActiveTargetId()
        return json({ ok: true, activeTargetId })
      },
      PUT: async ({ request }) => {
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

        const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
        const id = typeof record.id === 'string' ? record.id.trim() || undefined : undefined

        try {
          await setActiveTargetId(id)
          return json({ ok: true, activeTargetId: id })
        } catch (err) {
          return json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 404 },
          )
        }
      },
    },
  },
})
