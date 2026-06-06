import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { dashboardFetch } from '../../server/gateway-capabilities'

const BodySchema = z.object({
  provider: z.string().min(1),
})

type DashboardOAuthStartResponse = {
  session_id?: unknown
  user_code?: unknown
  verification_url?: unknown
  expires_in?: unknown
  poll_interval?: unknown
  detail?: unknown
  error?: unknown
  message?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.detail === 'string') return record.detail
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
  }
  return fallback
}

export const Route = createFileRoute('/api/oauth/device-code')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Invalid JSON' }, { status: 400 })
        }

        const parsed = BodySchema.safeParse(body)
        if (!parsed.success) {
          return json({ error: 'Missing provider' }, { status: 400 })
        }

        const { provider } = parsed.data

        if (provider === 'nous') {
          try {
            const res = await fetch(
              'https://portal.nousresearch.com/api/oauth/device/code',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'client_id=claude-cli',
              },
            )
            const data = await res.json()
            if (!res.ok) {
              return json(
                { error: data.error || 'Device code request failed' },
                { status: res.status },
              )
            }
            return json(data)
          } catch (err) {
            return json(
              { error: err instanceof Error ? err.message : 'Network error' },
              { status: 500 },
            )
          }
        }

        if (provider === 'openai-codex') {
          try {
            const res = await dashboardFetch(
              `/api/providers/oauth/${encodeURIComponent(provider)}/start`,
              {
                method: 'POST',
              },
            )
            const data =
              (await res.json().catch(() => ({}))) as DashboardOAuthStartResponse
            if (!res.ok) {
              return json(
                { error: readError(data, 'Device code request failed') },
                { status: res.status },
              )
            }

            return json({
              device_code: readString(data.session_id),
              user_code: readString(data.user_code),
              verification_uri_complete: readString(data.verification_url),
              expires_in: readNumber(data.expires_in, 900),
              interval: readNumber(data.poll_interval, 5),
            })
          } catch (err) {
            return json(
              { error: err instanceof Error ? err.message : 'Network error' },
              { status: 500 },
            )
          }
        }

        return json(
          {
            error: `OAuth device flow not supported for provider: ${provider}`,
          },
          { status: 400 },
        )
      },
    },
  },
})
