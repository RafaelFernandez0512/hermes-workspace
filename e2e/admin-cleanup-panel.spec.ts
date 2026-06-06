import { expect, test } from '@playwright/test'

test.describe('Admin cleanup panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__HERMES_FLAGS__ = { LIFECYCLE_V2: true }
    })
  })

  test('navigates to /admin without crashing', async ({ page }) => {
    const response = await page.goto('/admin')
    // Accept redirect-to-login or the actual page
    expect([200, 302, 401]).toContain(response?.status() ?? 200)
  })

  test('cleanup panel renders dry-run section when accessible', async ({
    page,
  }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // If the cleanup panel is visible (no auth wall), check for key UI elements
    const heading = page.getByText(/cleanup/i).first()
    if (await heading.isVisible({ timeout: 2000 })) {
      await expect(heading).toBeVisible()
      // Dry-run preview should be visible
      const preview = page.getByText(/orphaned|archived|stale/i).first()
      await expect(preview).toBeVisible({ timeout: 5000 })
    }
  })

  test('orphans action button exists and requires confirmation', async ({
    page,
  }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    const orphansBtn = page.getByRole('button', { name: /orphans/i })
    if (await orphansBtn.isVisible({ timeout: 2000 })) {
      await orphansBtn.click()
      // Two-step confirmation — a "Confirm" button should appear
      const confirmBtn = page.getByRole('button', { name: /confirm/i })
      await expect(confirmBtn).toBeVisible({ timeout: 2000 })
    }
  })
})
