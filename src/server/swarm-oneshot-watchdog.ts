import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newestCheckpointFromMessages, readRuntimeJson, type ParsedSwarmCheckpoint } from './swarm-checkpoints'
import { readWorkerMessages, type SwarmChatReadResult } from './swarm-chat-reader'
import { bumpHeartbeat } from './swarm-foundation'
import { recordMissionAssignmentStale } from './swarm-missions'

export type OneShotWatchdogResult = {
  status: 'not_applicable' | 'still_running' | 'terminal_checkpoint_observed' | 'stale_reconciled'
  runtimePath: string
  checkpoint: ParsedSwarmCheckpoint | null
  reason?: string
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readPid(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function isProcessAliveByPid(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return process.platform === 'linux' ? existsSync(`/proc/${pid}`) : false
  }
}

function writeRuntimePatch(runtimePath: string, workerId: string, patch: Record<string, unknown>): void {
  const current = readRuntimeJson(runtimePath)
  writeFileSync(runtimePath, JSON.stringify({ ...current, workerId, ...patch }, null, 2) + '\n')
  bumpHeartbeat(workerId)
}

export function reconcileExitedOneShotRuntime(input: {
  workerId: string
  profilePath: string
  now?: number
  isProcessAlive?: (pid: number) => boolean
  readMessages?: (profilePath: string, limit: number) => SwarmChatReadResult
}): OneShotWatchdogResult {
  const runtimePath = join(input.profilePath, 'runtime.json')
  const current = readRuntimeJson(runtimePath)
  const state = readString(current.state)
  const checkpointStatus = readString(current.checkpointStatus)
  const lastDispatchMode = readString(current.lastDispatchMode)
  const lastDispatchPid = readPid(current.lastDispatchPid)

  if (state !== 'executing' || checkpointStatus !== 'in_progress' || lastDispatchMode !== 'oneshot' || !lastDispatchPid) {
    return { status: 'not_applicable', runtimePath, checkpoint: null }
  }

  const processAlive = (input.isProcessAlive ?? isProcessAliveByPid)(lastDispatchPid)
  if (processAlive) {
    return { status: 'still_running', runtimePath, checkpoint: null }
  }

  const chat = (input.readMessages ?? readWorkerMessages)(input.profilePath, 40)
  const checkpoint = chat.ok ? newestCheckpointFromMessages(chat.messages) : null
  if (checkpoint && checkpoint.stateLabel !== 'IN_PROGRESS') {
    return { status: 'terminal_checkpoint_observed', runtimePath, checkpoint }
  }

  const reason = checkpoint?.stateLabel === 'IN_PROGRESS'
    ? `One-shot process ${lastDispatchPid} exited after reporting IN_PROGRESS and never emitted a terminal checkpoint.`
    : `One-shot process ${lastDispatchPid} exited without emitting a terminal checkpoint.`
  const nowAt = input.now ?? Date.now()
  const resultSummary = checkpoint?.result ?? readString(current.lastResult) ?? readString(current.lastSummary)
  const nextAction = 'Re-dispatch the task or require a canonical terminal checkpoint from the worker.'

  writeRuntimePatch(runtimePath, input.workerId, {
    state: 'idle',
    phase: 'orphaned',
    currentTask: null,
    checkpointStatus: 'needs_input',
    needsHuman: false,
    blockedReason: reason,
    lastCheckIn: new Date(nowAt).toISOString(),
    lastOutputAt: nowAt,
    lastSummary: reason,
    lastResult: resultSummary,
    lastRealSummary: reason,
    lastRealResult: resultSummary,
    nextAction,
    lastDispatchPid: null,
    lastDispatchResult: reason,
    checkpointRaw: checkpoint?.raw ?? readString(current.checkpointRaw) ?? null,
    orchestratorProcessedRaw: checkpoint?.raw ?? readString(current.orchestratorProcessedRaw) ?? null,
  })

  recordMissionAssignmentStale({
    missionId: readString(current.currentMissionId),
    assignmentId: readString(current.currentAssignmentId),
    workerId: input.workerId,
    reason,
    source: 'swarm-oneshot-watchdog',
  })

  return {
    status: 'stale_reconciled',
    runtimePath,
    checkpoint,
    reason,
  }
}
