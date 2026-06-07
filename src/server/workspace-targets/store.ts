import fs from 'node:fs/promises'
import path from 'node:path'
import { getStateDir } from '../workspace-state-dir'
import { WorkspaceTargetsFileSchema } from './schema'
import type { WorkspaceTarget, WorkspaceTargetsFile } from './types'

const FILE = path.join(getStateDir(), 'workspace-targets.json')

export async function loadTargetsFile(): Promise<WorkspaceTargetsFile> {
  try {
    const raw = await fs.readFile(FILE, 'utf-8')
    return WorkspaceTargetsFileSchema.parse(JSON.parse(raw))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, targets: [] }
    }
    throw e
  }
}

export async function saveTargetsFile(file: WorkspaceTargetsFile): Promise<void> {
  const tmp = `${FILE}.tmp-${process.pid}`
  await fs.mkdir(path.dirname(FILE), { recursive: true, mode: 0o700 })
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), { mode: 0o600 })
  await fs.rename(tmp, FILE)
  invalidateTargetsCache()
}

export async function getTarget(id: string): Promise<WorkspaceTarget | undefined> {
  const file = await loadTargetsFile()
  return file.targets.find((t) => t.id === id)
}

export async function upsertTarget(target: WorkspaceTarget): Promise<void> {
  const file = await loadTargetsFile()
  const idx = file.targets.findIndex((t) => t.id === target.id)
  if (idx >= 0) {
    file.targets[idx] = target
  } else {
    file.targets.push(target)
  }
  await saveTargetsFile(file)
}

export async function deleteTarget(id: string): Promise<void> {
  const file = await loadTargetsFile()
  file.targets = file.targets.filter((t) => t.id !== id)
  if (file.activeTargetId === id) {
    delete file.activeTargetId
  }
  await saveTargetsFile(file)
}

export async function getActiveTargetId(): Promise<string | undefined> {
  const file = await loadTargetsFile()
  return file.activeTargetId
}

export async function setActiveTargetId(id: string | undefined): Promise<void> {
  const file = await loadTargetsFile()
  if (id) {
    const exists = file.targets.some((t) => t.id === id)
    if (!exists) throw new Error(`Target "${id}" not found`)
    file.activeTargetId = id
  } else {
    delete file.activeTargetId
  }
  await saveTargetsFile(file)
}

// ── In-memory cache for sync getters ────────────────────────────────────────

let _cache: WorkspaceTargetsFile | null = null

export function invalidateTargetsCache(): void {
  _cache = null
}

export function getTargetsCacheSync(): WorkspaceTargetsFile | null {
  return _cache
}

/** Load and warm the cache. Call at startup or after store write. */
export async function warmTargetsCache(): Promise<WorkspaceTargetsFile> {
  const file = await loadTargetsFile()
  _cache = file
  return file
}
