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
  requireJsonContentType: () => null,
}))

import { Route } from './terminal-resize'
import { getTerminalSession } from '../../server/terminal-sessions'

beforeEach(() => {
  vi.mocked(getTerminalSession).mockReset()
})

describe('/api/terminal-resize', () => {
  it('returns 204 when the PTY session is already gone', async () => {
    vi.mocked(getTerminalSession).mockReturnValue(null)

    const res = await Route.server.handlers.POST({
      request: new Request('http://localhost/api/terminal-resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'dead', cols: 120, rows: 40 }),
      }),
    } as any)

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })
})
