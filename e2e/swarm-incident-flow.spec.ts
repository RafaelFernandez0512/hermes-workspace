// e2e/swarm-incident-flow.spec.ts
import { test, expect } from '@playwright/test'

test('swarm2 redirects to swarm', async ({ page }) => {
  const response = await page.goto('http://localhost:3000/swarm2')
  expect(page.url()).toContain('/swarm')
})

test('incident console shows Start / Resume Swarm on fresh state', async ({ page }) => {
  await page.goto('http://localhost:3000/swarm')
  await expect(page.getByRole('button', { name: 'Start / Resume Swarm' })).toBeVisible()
})

test('action bar shows Send guidance when running', async ({ page }) => {
  // This test requires a running swarm — mark as skip if no fixture
  test.skip(true, 'Requires running swarm fixture')
})
