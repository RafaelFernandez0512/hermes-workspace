import { describe, expect, it } from 'vitest'

// Minimal unit tests for cleanup panel logic (RTL tests require browser env setup)
// Full RTL coverage is in cleanup-panel.rtl.test.tsx

describe('CleanupPanel module', () => {
  it('module exports CleanupPanel component', async () => {
    // Dynamic import to avoid rendering in node env
    const mod = await import('./cleanup-panel')
    expect(typeof mod.CleanupPanel).toBe('function')
  })
})
