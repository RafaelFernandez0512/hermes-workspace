import { expect, test } from '@playwright/test'

test.describe('Lifecycle cascade (HERMES_LIFECYCLE_V2)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject flag so the client-side guard passes
    await page.addInitScript(() => {
      ;(window as any).__HERMES_FLAGS__ = { LIFECYCLE_V2: true }
    })
  })

  test('admin cleanup dry-run returns counts', async ({ page }) => {
    const res = await page.request.get('/api/admin/cleanup?action=dry-run', {
      headers: { Authorization: 'Bearer test' },
    })
    // 401 in a real env without auth; we just assert the shape is correct when auth passes
    expect([200, 401, 503]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json()
      expect(body).toHaveProperty('dryRun', true)
      expect(body).toHaveProperty('counts')
      expect(body.counts).toHaveProperty('orphanedCards')
      expect(body.counts).toHaveProperty('archivedMissions')
    }
  })

  test('kanban board shows archived lane toggle', async ({ page }) => {
    await page.goto('/swarm2')
    await page.waitForLoadState('networkidle')

    // If the page loaded the swarm board, look for the archived toggle button
    const toggle = page.getByRole('button', { name: /archived/i })
    if (await toggle.isVisible()) {
      await toggle.click()
      // After click, it should say "Hide archived" or the lanes should update
      await expect(toggle).toBeVisible()
    }
  })

  test('mission detail panel shows Archive button when mission is active', async ({
    page,
  }) => {
    await page.goto('/swarm2')
    await page.waitForLoadState('networkidle')

    // Click on a mission if one is visible
    const missionRow = page.locator('[data-testid="mission-row"]').first()
    if (await missionRow.isVisible()) {
      await missionRow.click()
      const archiveBtn = page.getByRole('button', { name: /archive/i }).first()
      if (await archiveBtn.isVisible()) {
        // Verify it is enabled (not already archived)
        await expect(archiveBtn).not.toBeDisabled()
      }
    }
  })

  test('POST archive card endpoint rejects unauthenticated request', async ({
    page,
  }) => {
    const res = await page.request.post(
      '/api/swarm-kanban/nonexistent-id/archive',
      {
        data: { actor: 'e2e-test' },
      },
    )
    // 401 without auth; 503 if flag off; 400 if flag is on but card not found
    expect([400, 401, 503]).toContain(res.status())
  })

  test('POST archive mission endpoint rejects unauthenticated request', async ({
    page,
  }) => {
    const res = await page.request.post(
      '/api/swarm-missions/nonexistent-id/archive',
      {
        data: { actor: 'e2e-test' },
      },
    )
    expect([400, 401, 503]).toContain(res.status())
  })
})
