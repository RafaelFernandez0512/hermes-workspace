/**
 * AsyncLocalStorage context for per-request workspace target resolution.
 * This file has no imports from workspace-targets or gateway to keep the
 * dependency graph acyclic.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export const activeTargetAls = new AsyncLocalStorage<{ targetId?: string }>()

export function getActiveTargetIdFromAls(): string | undefined {
  return activeTargetAls.getStore()?.targetId
}
