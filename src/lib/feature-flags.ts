/**
 * HERMES_LIFECYCLE_V2
 * Controls cascade cancel/archive/delete for Swarms and Missions,
 * the archived UI on kanban, and the /api/admin/cleanup/* endpoints.
 *
 * Default: OFF in production, ON in development and test.
 * Override: set HERMES_LIFECYCLE_V2=true|false in environment.
 * Runtime toggle: set window.__HERMES_FLAGS__.LIFECYCLE_V2 = true|false (client only).
 */

function resolveLifecycleV2(): boolean {
  if (typeof process !== 'undefined') {
    const env = process.env.HERMES_LIFECYCLE_V2
    if (env === 'true' || env === '1') return true
    if (env === 'false' || env === '0') return false
    return true
  }
  return false
}

declare global {
  interface Window {
    __HERMES_FLAGS__?: { LIFECYCLE_V2?: boolean }
  }
}

export function isLifecycleV2Enabled(): boolean {
  if (
    typeof window !== 'undefined' &&
    window.__HERMES_FLAGS__?.LIFECYCLE_V2 !== undefined
  ) {
    return Boolean(window.__HERMES_FLAGS__.LIFECYCLE_V2)
  }
  return resolveLifecycleV2()
}
