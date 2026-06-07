import { createFileRoute } from '@tanstack/react-router'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { closeTerminalSession, validateSessionTarget } from '../../server/terminal-sessions'
import { requireJsonContentType } from '../../server/rate-limit'
import { withTargetContext } from '../../server/workspace-targets/middleware'
import { getActiveTargetId } from '../../server/workspace-targets/resolver'

export const Route = createFileRoute('/api/terminal-close')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        return withTargetContext(request, async () => {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const sessionId =
            typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
          if (!sessionId) {
            return new Response(
              JSON.stringify({ ok: false, error: 'sessionId required' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
          if (!validateSessionTarget(sessionId, getActiveTargetId())) {
            return new Response(JSON.stringify({ ok: true }), {
              headers: { 'Content-Type': 'application/json' },
            })
          }
          closeTerminalSession(sessionId)
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
          })
        })
      },
    },
  },
})
