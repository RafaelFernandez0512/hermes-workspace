import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bumpHeartbeat = vi.fn()
const recordMissionAssignmentStale = vi.fn()

vi.mock('./swarm-foundation', () => ({
  bumpHeartbeat,
}))

vi.mock('./swarm-missions', () => ({
  recordMissionAssignmentStale,
}))

let tmpDir = ''

function writeRuntime(workerId: string, runtime: Record<string, unknown>) {
  const profilePath = path.join(tmpDir, workerId)
  fs.mkdirSync(profilePath, { recursive: true })
  fs.writeFileSync(path.join(profilePath, 'runtime.json'), JSON.stringify(runtime, null, 2) + '\n', 'utf8')
  return profilePath
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-oneshot-watchdog-'))
  bumpHeartbeat.mockReset()
  recordMissionAssignmentStale.mockReset()
  vi.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function loadModule() {
  return import('./swarm-oneshot-watchdog')
}

describe('reconcileExitedOneShotRuntime', () => {
  it('reconciles orphaned one-shot workers out of executing when only IN_PROGRESS was observed', async () => {
    const profilePath = writeRuntime('builder', {
      workerId: 'builder',
      state: 'executing',
      phase: 'dispatched',
      currentTask: 'Ship the patch',
      checkpointStatus: 'in_progress',
      lastDispatchMode: 'oneshot',
      lastDispatchPid: 424242,
      currentMissionId: 'mission-1',
      currentAssignmentId: 'assignment-1',
      lastSummary: 'Started work',
    })

    const { reconcileExitedOneShotRuntime } = await loadModule()
    const result = reconcileExitedOneShotRuntime({
      workerId: 'builder',
      profilePath,
      now: 1_746_000_000_000,
      isProcessAlive: () => false,
      readMessages: () => ({
        ok: true,
        sessionId: 'session-1',
        sessionTitle: 'Builder',
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          timestamp: 1_746_000_000_000,
          content: [
            'STATE: IN_PROGRESS',
            'FILES_CHANGED: src/server/swarm-oneshot-watchdog.ts',
            'COMMANDS_RUN: pnpm vitest run src/server/swarm-oneshot-watchdog.test.ts',
            'RESULT: Halfway through the patch',
            'BLOCKER: none',
            'NEXT_ACTION: keep going',
          ].join('\n'),
        }],
      }),
    })

    expect(result.status).toBe('stale_reconciled')
    expect(result.reason).toContain('never emitted a terminal checkpoint')

    const runtime = JSON.parse(fs.readFileSync(path.join(profilePath, 'runtime.json'), 'utf8'))
    expect(runtime.state).toBe('idle')
    expect(runtime.phase).toBe('orphaned')
    expect(runtime.currentTask).toBeNull()
    expect(runtime.checkpointStatus).toBe('needs_input')
    expect(runtime.lastDispatchPid).toBeNull()
    expect(runtime.blockedReason).toContain('IN_PROGRESS')
    expect(runtime.orchestratorProcessedRaw).toContain('STATE: IN_PROGRESS')
    expect(bumpHeartbeat).toHaveBeenCalledWith('builder')
    expect(recordMissionAssignmentStale).toHaveBeenCalledWith(expect.objectContaining({
      missionId: 'mission-1',
      assignmentId: 'assignment-1',
      workerId: 'builder',
    }))
  })

  it('leaves runtime alone when a dead one-shot already produced a terminal checkpoint', async () => {
    const profilePath = writeRuntime('reviewer', {
      workerId: 'reviewer',
      state: 'executing',
      phase: 'dispatched',
      currentTask: 'Review the patch',
      checkpointStatus: 'in_progress',
      lastDispatchMode: 'oneshot',
      lastDispatchPid: 777777,
    })

    const { reconcileExitedOneShotRuntime } = await loadModule()
    const result = reconcileExitedOneShotRuntime({
      workerId: 'reviewer',
      profilePath,
      isProcessAlive: () => false,
      readMessages: () => ({
        ok: true,
        sessionId: 'session-2',
        sessionTitle: 'Reviewer',
        messages: [{
          id: 'msg-2',
          role: 'assistant',
          timestamp: 1_746_000_100_000,
          content: [
            'STATE: DONE',
            'FILES_CHANGED: none',
            'COMMANDS_RUN: none',
            'RESULT: Review complete',
            'BLOCKER: none',
            'NEXT_ACTION: Route to QA',
          ].join('\n'),
        }],
      }),
    })

    expect(result.status).toBe('terminal_checkpoint_observed')
    expect(result.checkpoint?.stateLabel).toBe('DONE')

    const runtime = JSON.parse(fs.readFileSync(path.join(profilePath, 'runtime.json'), 'utf8'))
    expect(runtime.state).toBe('executing')
    expect(runtime.lastDispatchPid).toBe(777777)
    expect(recordMissionAssignmentStale).not.toHaveBeenCalled()
  })
})
