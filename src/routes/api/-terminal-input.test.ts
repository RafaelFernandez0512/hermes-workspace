import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

vi.mock('../../server/auth-middleware', () => ({
  requireLocalOrAuth: () => true,
}))

vi.mock('../../server/terminal-sessions', () => ({
  getTerminalSession: vi.fn(),
}))

vi.mock('../../server/rate-limit', () => ({
  getClientIp: () => '127.0.0.1',
  rateLimit: () => true,
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
  requireJsonContentType: () => null,
}))

import { Route } from './terminal-input'
import { getTerminalSession } from '../../server/terminal-sessions'

beforeEach(() => {
  vi.mocked(getTerminalSession).mockReset()
})

describe('/api/terminal-input', () => {
  it('returns 204 when the PTY session is already gone', async () => {
    vi.mocked(getTerminalSession).mockReturnValue(null)

    const res = await Route.server.handlers.POST({
      request: new Request('http://localhost/api/terminal-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'dead', data: 'ls\n' }),
      }),
    } as any)

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })
})
