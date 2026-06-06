import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Each test gets a fresh tmpDir and resets all module caches so that
// path constants (SWARM_MISSIONS_PATH, SWARM_KANBAN_FILE) are re-evaluated.

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-lc-'))
  fs.mkdirSync(path.join(tmpDir, '.runtime'), { recursive: true })
  process.env.HERMES_HOME = tmpDir
  process.env.HERMES_LIFECYCLE_V2 = 'true'
  vi.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.HERMES_HOME
  delete process.env.HERMES_LIFECYCLE_V2
})

async function getMissions() {
  vi.doMock('../swarm-environment', () => ({
    SWARM_CANONICAL_REPO: tmpDir,
    SWARM_MEMORY_ROOT: tmpDir,
    SWARM_FORBIDDEN_PATHS: [],
  }))
  vi.doMock('../swarm-event-bus', () => ({ publishSwarmEvent: vi.fn() }))
  return import('../swarm-missions')
}

async function getKanban() {
  return import('../swarm-kanban-store')
}

describe('SwarmMission lifecycle', () => {
  it('archives a cancelled mission', async () => {
    const { createOrUpdateMission, cancelSwarmMission, archiveSwarmMission } =
      await getMissions()
    const m = createOrUpdateMission({ title: 'test mission', assignments: [] })
    cancelSwarmMission({ missionId: m.id, actor: 'test' })
    const result = archiveSwarmMission({
      missionId: m.id,
      actor: 'archiver',
      reason: 'done',
    })
    expect(result).not.toBeNull()
    expect(result!.changed).toBe(true)
    expect(result!.mission.state).toBe('archived')
    expect(result!.mission.archivedAt).toBeTypeOf('number')
    expect(result!.mission.archivedBy).toBe('archiver')
    expect(result!.mission.archiveReason).toBe('done')
  })

  it('archive is idempotent', async () => {
    const { createOrUpdateMission, archiveSwarmMission } = await getMissions()
    const m = createOrUpdateMission({ title: 'idem', assignments: [] })
    archiveSwarmMission({ missionId: m.id })
    const r2 = archiveSwarmMission({ missionId: m.id })
    expect(r2!.changed).toBe(false)
  })

  it('unarchives a mission back to cancelled', async () => {
    const {
      createOrUpdateMission,
      archiveSwarmMission,
      unarchiveSwarmMission,
    } = await getMissions()
    const m = createOrUpdateMission({ title: 'unarc', assignments: [] })
    archiveSwarmMission({ missionId: m.id })
    const result = unarchiveSwarmMission({ missionId: m.id, actor: 'user' })
    expect(result!.mission.state).toBe('cancelled')
    expect(result!.mission.archivedAt).toBeNull()
  })

  it('delete requires cancelled/archived/complete state', async () => {
    const { createOrUpdateMission, deleteSwarmMission } = await getMissions()
    const m = createOrUpdateMission({ title: 'live', assignments: [] })
    expect(() => deleteSwarmMission({ missionId: m.id })).toThrow(
      /cancelled or archived/,
    )
  })

  it('delete succeeds on archived mission and marks isDeleted', async () => {
    const {
      createOrUpdateMission,
      archiveSwarmMission,
      deleteSwarmMission,
      getSwarmMission,
    } = await getMissions()
    const m = createOrUpdateMission({ title: 'del', assignments: [] })
    archiveSwarmMission({ missionId: m.id })
    const result = deleteSwarmMission({
      missionId: m.id,
      actor: 'admin',
      reason: 'purge',
    })
    expect(result!.changed).toBe(true)
    const stored = getSwarmMission(m.id)
    expect(stored?.isDeleted).toBe(true)
    expect(stored?.deletedBy).toBe('admin')
  })

  it('delete is idempotent', async () => {
    const { createOrUpdateMission, archiveSwarmMission, deleteSwarmMission } =
      await getMissions()
    const m = createOrUpdateMission({ title: 'del2', assignments: [] })
    archiveSwarmMission({ missionId: m.id })
    deleteSwarmMission({ missionId: m.id })
    const r2 = deleteSwarmMission({ missionId: m.id })
    expect(r2!.changed).toBe(false)
  })
})

describe('SwarmKanbanCard lifecycle', () => {
  it('archives a card', async () => {
    const { createSwarmKanbanCard, archiveSwarmKanbanCard, isArchivedCard } =
      await getKanban()
    const card = createSwarmKanbanCard({ title: 'my card', createdBy: 'test' })
    const updated = archiveSwarmKanbanCard(card.id, {
      actor: 'user',
      reason: 'stale',
    })
    expect(updated).not.toBeNull()
    expect(isArchivedCard(updated!)).toBe(true)
    expect(updated!.archivedBy).toBe('user')
  })

  it('unarchives a card back to done', async () => {
    const {
      createSwarmKanbanCard,
      archiveSwarmKanbanCard,
      unarchiveSwarmKanbanCard,
      isArchivedCard,
    } = await getKanban()
    const card = createSwarmKanbanCard({
      title: 'unarch card',
      createdBy: 'test',
    })
    archiveSwarmKanbanCard(card.id, { actor: 'user' })
    const updated = unarchiveSwarmKanbanCard(card.id, { actor: 'user' })
    expect(isArchivedCard(updated!)).toBe(false)
    expect(updated!.status).toBe('done')
  })

  it('delete requires archived/done or force', async () => {
    const { createSwarmKanbanCard, deleteSwarmKanbanCard } = await getKanban()
    const card = createSwarmKanbanCard({
      title: 'active',
      createdBy: 'test',
      status: 'running',
    })
    expect(() => deleteSwarmKanbanCard(card.id)).toThrow(/archived or done/)
  })

  it('delete succeeds on archived card', async () => {
    const {
      createSwarmKanbanCard,
      archiveSwarmKanbanCard,
      deleteSwarmKanbanCard,
      getSwarmKanbanCard,
      isDeletedCard,
    } = await getKanban()
    const card = createSwarmKanbanCard({ title: 'del card', createdBy: 'test' })
    archiveSwarmKanbanCard(card.id, { actor: 'user' })
    const result = deleteSwarmKanbanCard(card.id, { actor: 'admin' })
    expect(result!.changed).toBe(true)
    const stored = getSwarmKanbanCard(card.id)
    expect(isDeletedCard(stored!)).toBe(true)
  })
})
