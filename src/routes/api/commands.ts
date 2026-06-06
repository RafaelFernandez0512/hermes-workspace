/**
 * Server-side proxy for /v1/commands on the gateway.
 *
 * The gateway exposes a list of slash commands at /v1/commands.
 * This route proxies that call server-side (with gateway auth) so the
 * browser never needs to reach the gateway port directly.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { gatewayFetch } from '../../server/gateway-capabilities'

export const Route = createFileRoute('/api/commands')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const res = await gatewayFetch('/v1/commands')

          if (!res.ok) {
            // Older / reduced Hermes backends may not expose /v1/commands.
            // The client already has DEFAULT_SLASH_COMMANDS, so degrade
            // quietly instead of surfacing a noisy 404/500 loop in the UI.
            if (res.status === 404 || res.status === 501 || res.status === 503) {
              return json({ commands: [] })
            }
            return json(
              { error: `Gateway responded with status ${res.status}` },
              { status: res.status },
            )
          }

          const body = await res.json()
          return Response.json(body)
        } catch {
          return json({ commands: [] })
        }
      },
    },
  },
})
