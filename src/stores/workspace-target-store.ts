import { create } from 'zustand'
import type { WorkspaceTarget } from '../server/workspace-targets/types'
import {
  listTargets,
  setActiveTargetId as apiSetActiveTargetId,
  upsertTarget as apiUpsertTarget,
  deleteTarget as apiDeleteTarget,
} from '../lib/workspace-targets-api'

type WorkspaceTargetState = {
  targets: WorkspaceTarget[]
  activeTargetId: string | undefined
  isLoaded: boolean
  error: string | null

  load: () => Promise<void>
  setActive: (id: string | undefined) => Promise<void>
  upsert: (target: WorkspaceTarget) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useWorkspaceTargetStore = create<WorkspaceTargetState>((set, get) => ({
  targets: [],
  activeTargetId: undefined,
  isLoaded: false,
  error: null,

  load: async () => {
    try {
      const { targets, activeTargetId } = await listTargets()
      set({ targets, activeTargetId, isLoaded: true, error: null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  setActive: async (id) => {
    await apiSetActiveTargetId(id)
    set({ activeTargetId: id })

    // Update cookie so SSE/SSR requests include the target context
    if (typeof document !== 'undefined') {
      if (id) {
        document.cookie = `hermes_target_id=${encodeURIComponent(id)}; path=/; SameSite=Lax`
      } else {
        document.cookie = 'hermes_target_id=; path=/; max-age=0'
      }
    }
  },

  upsert: async (target) => {
    const saved = await apiUpsertTarget(target)
    set((state) => {
      const idx = state.targets.findIndex((t) => t.id === saved.id)
      if (idx >= 0) {
        const next = [...state.targets]
        next[idx] = saved
        return { targets: next }
      }
      return { targets: [...state.targets, saved] }
    })
  },

  remove: async (id) => {
    await apiDeleteTarget(id)
    set((state) => {
      const next = state.targets.filter((t) => t.id !== id)
      const activeTargetId = state.activeTargetId === id ? undefined : state.activeTargetId
      return { targets: next, activeTargetId }
    })
    // Clear cookie if removed target was active
    const { activeTargetId } = get()
    if (!activeTargetId && typeof document !== 'undefined') {
      document.cookie = 'hermes_target_id=; path=/; max-age=0'
    }
  },
}))
