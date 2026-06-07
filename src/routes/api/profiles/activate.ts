import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  setActiveProfile,
  readProfile,
} from '../../../server/profiles-browser'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/profiles/activate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        try {
          const body = (await request.json()) as { name?: string }
          const profileName = body.name || 'default'
          setActiveProfile(profileName)

          // Resolve the profile's workspace target and update the cookie so
          // the next SSR/SSE request picks up the right target immediately.
          let targetId: string | undefined
          try {
            const profile = readProfile(profileName)
            targetId = profile.workspaceTargetId
          } catch {
            // profile unreadable — leave cookie unchanged
          }

          const cookieVal = targetId
            ? `hermes_target_id=${encodeURIComponent(targetId)}; Path=/; SameSite=Lax`
            : `hermes_target_id=; Path=/; SameSite=Lax; Max-Age=0`

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': cookieVal,
            },
          })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to activate profile',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
