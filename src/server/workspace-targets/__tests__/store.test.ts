import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Override the state dir to a temp directory so tests are hermetic.
let tmpDir: string

vi.mock('../../workspace-state-dir', () => ({
  getStateDir: () => tmpDir,
}))

// Import after mock setup so the FILE path picks up our tmpDir.
// We use dynamic import to ensure the mocked module is used.
const storeModule = () => import('../store')

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-store-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  vi.resetModules()
})

describe('loadTargetsFile', () => {
  it('returns empty file when targets file does not exist', async () => {
    const { loadTargetsFile } = await storeModule()
    const file = await loadTargetsFile()
    expect(file).toEqual({ version: 1, targets: [] })
  })
})

describe('saveTargetsFile + loadTargetsFile roundtrip', () => {
  it('persists and reloads a target correctly', async () => {
    const { saveTargetsFile, loadTargetsFile } = await storeModule()
    const data = {
      version: 1 as const,
      targets: [
        {
          id: 'pc1',
          name: 'Office PC',
          terminal: { mode: 'ssh' as const, ssh: { host: '10.0.0.1', user: 'alice', keyPath: '~/.ssh/id_ed25519' } },
        },
      ],
    }
    await saveTargetsFile(data)
    const loaded = await loadTargetsFile()
    expect(loaded.targets).toHaveLength(1)
    expect(loaded.targets[0].id).toBe('pc1')
    expect(loaded.targets[0].name).toBe('Office PC')
  })

  it('writes the file with mode 0o600', async () => {
    const { saveTargetsFile } = await storeModule()
    await saveTargetsFile({ version: 1, targets: [] })
    const filepath = path.join(tmpDir, 'workspace-targets.json')
    const stat = await fs.stat(filepath)
    // eslint-disable-next-line no-bitwise
    expect(stat.mode & 0o777).toBe(0o600)
  })
})

describe('upsertTarget', () => {
  it('adds a new target', async () => {
    const { upsertTarget, loadTargetsFile } = await storeModule()
    await upsertTarget({ id: 't1', name: 'Test' })
    const file = await loadTargetsFile()
    expect(file.targets).toHaveLength(1)
    expect(file.targets[0].id).toBe('t1')
  })

  it('updates an existing target without duplicating', async () => {
    const { upsertTarget, loadTargetsFile } = await storeModule()
    await upsertTarget({ id: 't1', name: 'Original' })
    await upsertTarget({ id: 't1', name: 'Updated' })
    const file = await loadTargetsFile()
    expect(file.targets).toHaveLength(1)
    expect(file.targets[0].name).toBe('Updated')
  })
})

describe('deleteTarget', () => {
  it('removes the target and clears activeTargetId when it matches', async () => {
    const { upsertTarget, setActiveTargetId, deleteTarget, loadTargetsFile } = await storeModule()
    await upsertTarget({ id: 'del-me', name: 'Temp' })
    await setActiveTargetId('del-me')
    await deleteTarget('del-me')
    const file = await loadTargetsFile()
    expect(file.targets).toHaveLength(0)
    expect(file.activeTargetId).toBeUndefined()
  })
})

describe('Zod rejects invalid data', () => {
  it('throws when the file contains invalid JSON shape', async () => {
    const { loadTargetsFile } = await storeModule()
    const filepath = path.join(tmpDir, 'workspace-targets.json')
    await fs.mkdir(tmpDir, { recursive: true })
    await fs.writeFile(filepath, JSON.stringify({ version: 'bad', targets: 'not-an-array' }))
    await expect(loadTargetsFile()).rejects.toThrow()
  })
})
