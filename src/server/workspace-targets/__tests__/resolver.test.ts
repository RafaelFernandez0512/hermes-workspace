import { describe, expect, it, vi } from 'vitest'
import { activeTargetAls } from '../context'

vi.mock('../../workspace-state-dir', () => ({
  getStateDir: () => '/tmp/hermes-resolver-test',
}))

// Stub the gateway-capabilities module so the resolver tests don't need a
// real Hermes gateway running.
vi.mock('../../gateway-capabilities', () => ({
  CLAUDE_API: 'http://127.0.0.1:8642',
  CLAUDE_DASHBOARD_URL: 'http://127.0.0.1:9119',
  getActiveGatewayUrl: vi.fn(() => 'http://127.0.0.1:8642'),
  getActiveDashboardUrl: vi.fn(() => 'http://127.0.0.1:9119'),
}))

// Stub the store to control cache contents.
const mockCache: { targets: Array<{ id: string; name: string; hermes?: { gatewayUrl?: string; dashboardUrl?: string } }> } = {
  targets: [],
}

vi.mock('../store', () => ({
  loadTargetsFile: vi.fn(async () => ({ version: 1, targets: mockCache.targets })),
  getTargetsCacheSync: vi.fn(() => ({ version: 1, targets: mockCache.targets })),
  warmTargetsCache: vi.fn(async () => {}),
}))

describe('getActiveTargetId', () => {
  it('returns undefined when ALS has no store', async () => {
    const { getActiveTargetId } = await import('../resolver')
    expect(getActiveTargetId()).toBeUndefined()
  })

  it('returns the targetId from ALS when set', async () => {
    const { getActiveTargetId } = await import('../resolver')
    const result = await activeTargetAls.run({ targetId: 'pc1' }, async () => {
      return getActiveTargetId()
    })
    expect(result).toBe('pc1')
  })
})

describe('resolveHermesApi', () => {
  it('returns default target when no ALS target is active', async () => {
    const { resolveHermesApi } = await import('../resolver')
    const api = await resolveHermesApi()
    expect(api.source).toBe('default')
    expect(api.gatewayUrl).toBe('http://127.0.0.1:8642')
  })

  it('returns default when target id is set but target has no hermes config', async () => {
    mockCache.targets = [{ id: 'no-hermes', name: 'Plain' }]
    const { resolveHermesApi } = await import('../resolver')
    const api = await activeTargetAls.run({ targetId: 'no-hermes' }, resolveHermesApi)
    expect(api.source).toBe('default')
  })

  it('returns profile target when target has hermes.gatewayUrl', async () => {
    mockCache.targets = [
      {
        id: 'remote-pc',
        name: 'Remote',
        hermes: { gatewayUrl: 'http://10.0.0.5:8642', dashboardUrl: 'http://10.0.0.5:9119' },
      },
    ]
    const { resolveHermesApi } = await import('../resolver')
    const api = await activeTargetAls.run({ targetId: 'remote-pc' }, resolveHermesApi)
    expect(api.source).toBe('profile')
    expect(api.gatewayUrl).toBe('http://10.0.0.5:8642')
    expect(api.dashboardUrl).toBe('http://10.0.0.5:9119')
  })
})
