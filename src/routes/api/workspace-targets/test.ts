import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import { testTarget } from '../../../server/workspace-targets/health'

export const Route = createFileRoute('/api/workspace-targets/test')({
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

        const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
        const id = typeof record.id === 'string' ? record.id.trim() : ''
        if (!id) return json({ ok: false, error: 'Missing id' }, { status: 400 })

        try {
          const result = await testTarget(id)
          return json({ ok: true, ...result })
        } catch (err) {
          const status = (err as { status?: number }).status ?? 500
          return json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status },
          )
        }
      },
    },
  },
})
