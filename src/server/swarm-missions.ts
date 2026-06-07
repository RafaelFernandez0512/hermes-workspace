import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import { getProfilesDir } from './claude-paths'
import { readSwarmRuntimeFile } from './swarm-foundation'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'
import { publishSwarmEvent } from './swarm-event-bus'

export type SwarmMissionAssignmentState =
  | 'queued'
  | 'waiting_on_dependency'
  | 'dispatched'
  | 'executing'
  | 'checkpointed'
  | 'blocked'
  | 'stale'
  | 'needs_input'
  | 'reviewing'
  | 'done'
  | 'cancelled'
export type SwarmMissionState = 'planning' | 'dispatching' | 'executing' | 'reviewing' | 'blocked' | 'complete' | 'cancelled'

export type SwarmMissionAssignment = {
  id: string
  workerId: string
  task: string
  rationale: string | null
  dependsOn: Array<string>
  reviewRequired: boolean
  state: SwarmMissionAssignmentState
  dispatchedAt: number | null
  completedAt: number | null
  reviewedAt: number | null
  reviewedBy: string | null
  checkpoint: ParsedSwarmCheckpoint | null
  lastHeartbeatAt: number | null
  lastOutputAt: number | null
  blockerReason: string | null
  staleReason: string | null
}

export type SwarmMissionEvent = {
  id: string
  type: 'created' | 'assignment_dispatched' | 'checkpoint' | 'continuation' | 'review' | 'blocked' | 'assignment_cancelled' | 'mission_cancelled'
  at: number
  workerId?: string
  assignmentId?: string
  message: string
  data?: Record<string, unknown>
}

export type SwarmCheckpointReport = {
  missionId: string
  assignmentId: string
  workerId: string
  recordedAt: number
  stateLabel: ParsedSwarmCheckpoint['stateLabel']
  checkpointStatus: ParsedSwarmCheckpoint['checkpointStatus']
  runtimeState: ParsedSwarmCheckpoint['runtimeState']
  filesChanged: string | null
  commandsRun: string | null
  result: string | null
  blocker: string | null
  nextAction: string | null
  source: string
}

export type SwarmMission = {
  id: string
  title: string
  state: SwarmMissionState
  createdAt: number
  updatedAt: number
  archivedAt?: number | null
  deletedAt?: number | null
  runId: string | null
  dispatchState: 'idle' | 'queued' | 'dispatching' | 'stale' | 'blocked' | 'done'
  dispatchRequestedAt: number | null
  dispatchStartedAt: number | null
  dispatchCompletedAt: number | null
  dispatchLastHeartbeatAt: number | null
  dispatchLastOutputAt: number | null
  dispatchReason: string | null
  assignments: Array<SwarmMissionAssignment>
  events: Array<SwarmMissionEvent>
}

type SwarmMissionStore = {
  version: 1
  missions: Array<SwarmMission>
}

export const SWARM_MISSIONS_PATH = join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-missions.json')

function now(): number {
  return Date.now()
}

function shortId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readStore(): SwarmMissionStore {
  if (!existsSync(SWARM_MISSIONS_PATH)) return { version: 1, missions: [] }
  try {
    const parsed = JSON.parse(readFileSync(SWARM_MISSIONS_PATH, 'utf8')) as SwarmMissionStore
    return { version: 1, missions: Array.isArray(parsed.missions) ? parsed.missions.map(hydrateMissionRecord) : [] }
  } catch {
    return { version: 1, missions: [] }
  }
}

function writeStore(store: SwarmMissionStore): void {
  mkdirSync(dirname(SWARM_MISSIONS_PATH), { recursive: true })
  const tmp = `${SWARM_MISSIONS_PATH}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n')
  renameSync(tmp, SWARM_MISSIONS_PATH)
}

function event(type: SwarmMissionEvent['type'], message: string, extra?: Partial<SwarmMissionEvent>): SwarmMissionEvent {
  return { id: shortId('evt'), type, at: now(), message, ...extra }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || /^none$/i.test(trimmed)) return null
  return trimmed
}

function normalizeCheckpointRecord(
  checkpoint: ParsedSwarmCheckpoint | null | undefined,
): ParsedSwarmCheckpoint | null {
  if (!checkpoint) return null
  return {
    ...checkpoint,
    filesChanged: normalizeOptionalText(checkpoint.filesChanged),
    commandsRun: normalizeOptionalText(checkpoint.commandsRun),
    result: normalizeOptionalText(checkpoint.result),
    blocker: normalizeOptionalText(checkpoint.blocker),
    nextAction: normalizeOptionalText(checkpoint.nextAction),
  }
}

function normalizeReportRecord(
  report: SwarmCheckpointReport,
): SwarmCheckpointReport {
  return {
    ...report,
    filesChanged: normalizeOptionalText(report.filesChanged),
    commandsRun: normalizeOptionalText(report.commandsRun),
    result: normalizeOptionalText(report.result),
    blocker: normalizeOptionalText(report.blocker),
    nextAction: normalizeOptionalText(report.nextAction),
    source: report.source?.trim() || 'unknown',
  }
}

function publishMissionEvent(mission: SwarmMission, evt: SwarmMissionEvent): void {
  const kind = evt.type === 'checkpoint'
    ? 'checkpoint' as const
    : evt.type === 'blocked'
      ? 'blocked' as const
      : evt.type === 'mission_cancelled' || evt.type === 'assignment_cancelled'
        ? 'cancelled' as const
        : evt.type === 'assignment_dispatched'
          ? 'assignment_state' as const
          : 'mission_state' as const
  try {
    publishSwarmEvent({
      kind,
      missionId: mission.id,
      assignmentId: evt.assignmentId,
      workerId: evt.workerId,
      ts: evt.at,
      payload: { message: evt.message, data: evt.data ?? {}, state: mission.state },
    })
  } catch {
    /* best effort */
  }
}

function reportFromCheckpoint(input: {
  missionId: string
  assignmentId: string
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
  source?: string | null
}): SwarmCheckpointReport {
  return normalizeReportRecord({
    missionId: input.missionId,
    assignmentId: input.assignmentId,
    workerId: input.workerId,
    recordedAt: now(),
    stateLabel: input.checkpoint.stateLabel,
    checkpointStatus: input.checkpoint.checkpointStatus,
    runtimeState: input.checkpoint.runtimeState,
    filesChanged: input.checkpoint.filesChanged,
    commandsRun: input.checkpoint.commandsRun,
    result: input.checkpoint.result,
    blocker: input.checkpoint.blocker,
    nextAction: input.checkpoint.nextAction,
    source: input.source?.trim() || 'unknown',
  })
}

function isDependencySatisfied(assignment: SwarmMissionAssignment): boolean {
  return assignment.state === 'done' || (assignment.state === 'checkpointed' && !assignment.reviewRequired)
}

function isDependencyFailure(assignment: SwarmMissionAssignment): boolean {
  return assignment.state === 'blocked' || assignment.state === 'stale' || assignment.state === 'needs_input' || assignment.state === 'cancelled'
}

function dependencySummaryForAssignment(input: {
  mission: SwarmMission
  assignment: SwarmMissionAssignment
}): { ready: boolean; waitingOn: Array<string>; blocker: string | null } {
  const byId = new Map(input.mission.assignments.map((item) => [item.id, item]))
  const waitingOn: Array<string> = []
  const blockers: Array<string> = []
  for (const dependencyId of input.assignment.dependsOn) {
    const dependency = byId.get(dependencyId)
    if (!dependency) {
      blockers.push(`Missing dependency ${dependencyId}`)
      continue
    }
    if (isDependencySatisfied(dependency)) continue
    if (isDependencyFailure(dependency)) {
      blockers.push(`Dependency ${dependencyId} is ${dependency.state}${dependency.staleReason ? ` (${dependency.staleReason})` : ''}`)
      continue
    }
    waitingOn.push(dependencyId)
  }
  if (blockers.length > 0) {
    return { ready: false, waitingOn, blocker: blockers.join('; ') }
  }
  if (waitingOn.length > 0) {
    return { ready: false, waitingOn, blocker: `Waiting on dependency: ${waitingOn.join(', ')}` }
  }
  return { ready: true, waitingOn, blocker: null }
}

function deriveMissionState(mission: Pick<SwarmMission, 'assignments' | 'dispatchState'>): SwarmMissionState {
  const assignments = mission.assignments
  if (assignments.length > 0 && assignments.every((item) => item.state === 'cancelled')) return 'cancelled'
  if (assignments.some((item) => item.state === 'blocked' || item.state === 'stale' || item.state === 'needs_input')) return 'blocked'
  if (assignments.length > 0 && assignments.every((item) => item.state === 'done' || item.state === 'cancelled' || (item.state === 'checkpointed' && !item.reviewRequired))) return 'complete'
  if (assignments.some((item) => item.state === 'reviewing' || (item.state === 'checkpointed' && item.reviewRequired))) return 'reviewing'
  if (assignments.some((item) => item.state === 'executing' || item.state === 'dispatched' || item.state === 'checkpointed')) return 'executing'
  if (mission.dispatchState === 'dispatching') return 'dispatching'
  return 'planning'
}

function inferReviewRequired(task: string, rationale?: string | null): boolean {
  // Match intent-bearing task terms only. The previous loose alternation matched
  // substrings such as "patch" inside "dispatch" and left simple smoke runs in
  // review forever.
  return /\b(code|patch(?:es|ed|ing)?|implement(?:ation|ed|ing)?|pr|benchmarks?)\b/i.test(`${task} ${rationale ?? ''}`)
}

const TERMINAL_ASSIGNMENT_STATES = new Set<SwarmMissionAssignmentState>(['done', 'cancelled'])

function isTerminalAssignment(assignment: SwarmMissionAssignment): boolean {
  return TERMINAL_ASSIGNMENT_STATES.has(assignment.state)
}

function defaultMissionDispatch(input?: Partial<Pick<SwarmMission, 'runId' | 'dispatchState' | 'dispatchRequestedAt' | 'dispatchStartedAt' | 'dispatchCompletedAt' | 'dispatchLastHeartbeatAt' | 'dispatchLastOutputAt' | 'dispatchReason'>>): Pick<SwarmMission, 'runId' | 'dispatchState' | 'dispatchRequestedAt' | 'dispatchStartedAt' | 'dispatchCompletedAt' | 'dispatchLastHeartbeatAt' | 'dispatchLastOutputAt' | 'dispatchReason'> {
  return {
    runId: input?.runId ?? null,
    dispatchState: input?.dispatchState ?? 'idle',
    dispatchRequestedAt: input?.dispatchRequestedAt ?? null,
    dispatchStartedAt: input?.dispatchStartedAt ?? null,
    dispatchCompletedAt: input?.dispatchCompletedAt ?? null,
    dispatchLastHeartbeatAt: input?.dispatchLastHeartbeatAt ?? null,
    dispatchLastOutputAt: input?.dispatchLastOutputAt ?? null,
    dispatchReason: input?.dispatchReason ?? null,
  }
}

function assignmentLifecycleState(input: {
  mission: SwarmMission
  assignment: SwarmMissionAssignment
}): {
  state: SwarmMissionAssignmentState
  blockerReason: string | null
  staleReason: string | null
} {
  const dependency = dependencySummaryForAssignment(input)
  if (!dependency.ready) {
    if (dependency.blocker?.startsWith('Waiting on dependency:')) {
      return {
        state: 'waiting_on_dependency',
        blockerReason: null,
        staleReason: null,
      }
    }
    return {
      state: 'blocked',
      blockerReason: dependency.blocker,
      staleReason: null,
    }
  }
  return {
    state: input.assignment.state,
    blockerReason: input.assignment.blockerReason,
    staleReason: input.assignment.staleReason,
  }
}

function hydrateMissionRecord(mission: SwarmMission): SwarmMission {
  const dispatch = defaultMissionDispatch(mission)
  return {
    ...mission,
    ...dispatch,
    dispatchReason: normalizeOptionalText(dispatch.dispatchReason),
    assignments: Array.isArray(mission.assignments)
      ? mission.assignments.map((assignment) => ({
        ...assignment,
        dependsOn: Array.isArray(assignment.dependsOn) ? assignment.dependsOn : [],
        checkpoint: normalizeCheckpointRecord(assignment.checkpoint),
        lastHeartbeatAt: assignment.lastHeartbeatAt ?? null,
        lastOutputAt: assignment.lastOutputAt ?? null,
        blockerReason: normalizeOptionalText(assignment.blockerReason),
        staleReason: normalizeOptionalText(assignment.staleReason),
      }))
      : [],
    events: Array.isArray(mission.events)
      ? mission.events.map((evt) => (
        evt.type === 'checkpoint' && evt.data
          ? { ...evt, data: normalizeReportRecord(evt.data as SwarmCheckpointReport) }
          : evt
      ))
      : [],
  }
}

export function listSwarmMissions(limit = 20): Array<SwarmMission> {
  return readStore().missions
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, Math.min(100, limit)))
}

export function getSwarmMission(missionId: string): SwarmMission | null {
  return readStore().missions.find((mission) => mission.id === missionId) ?? null
}

export function archiveStaleMissions(staleMs: number = 6 * 60 * 60 * 1000): { archivedIds: Array<string>; count: number } {
  const store = readStore()
  const now = Date.now()
  const archivedIds: Array<string> = []
  for (const mission of store.missions) {
    if (mission.state !== 'executing' && mission.state !== 'planning' && mission.state !== 'dispatching') continue
    if ((now - mission.updatedAt) < staleMs) continue
    if (!mission.assignments.every(a => ['done', 'checkpointed', 'blocked', 'needs_input', 'stale'].includes(a.state))) continue
    mission.state = 'complete'
    mission.dispatchState = 'done'
    mission.dispatchCompletedAt = now
    mission.events.push(event('continuation', `Archived as stale (>${Math.round(staleMs / 3600000)}h, all assignments terminal)`))
    archivedIds.push(mission.id)
  }
  if (archivedIds.length) {
    writeStore(store)
  }
  return { archivedIds, count: archivedIds.length }
}

export type CreateOrUpdateMissionResult = SwarmMission & { _created?: boolean }

export function createOrUpdateMission(input: {
  missionId?: string | null
  title: string
  assignments: Array<{ workerId: string; task: string; rationale?: string | null; dependsOn?: Array<string>; reviewRequired?: boolean }>
}): CreateOrUpdateMissionResult {
  const store = readStore()
  const createdAt = now()
  const missionId = input.missionId?.trim() || shortId('mission')
  let mission = store.missions.find((item) => item.id === missionId)
  let createdMission = false
  if (!mission) {
    mission = {
      id: missionId,
      title: input.title || 'Untitled swarm mission',
      state: 'planning',
      createdAt,
      updatedAt: createdAt,
      runId: null,
      dispatchState: 'idle',
      dispatchRequestedAt: null,
      dispatchStartedAt: null,
      dispatchCompletedAt: null,
      dispatchLastHeartbeatAt: null,
      dispatchLastOutputAt: null,
      dispatchReason: null,
      assignments: [],
      events: [event('created', `Mission created: ${input.title || missionId}`)],
    }
    store.missions.push(mission)
    createdMission = true
  }

  mission.title = input.title || mission.title
  mission.runId ??= null
  mission.dispatchState ??= 'idle'
  mission.dispatchRequestedAt ??= null
  mission.dispatchStartedAt ??= null
  mission.dispatchCompletedAt ??= null
  mission.dispatchLastHeartbeatAt ??= null
  mission.dispatchLastOutputAt ??= null
  mission.dispatchReason ??= null
  for (const assignment of input.assignments) {
    const existing = mission.assignments.find((item) => item.workerId === assignment.workerId && item.task === assignment.task)
    if (existing) continue
    const id = shortId('assign')
    mission.assignments.push({
      id,
      workerId: assignment.workerId,
      task: assignment.task,
      rationale: assignment.rationale ?? null,
      dependsOn: assignment.dependsOn ?? [],
      reviewRequired: assignment.reviewRequired ?? inferReviewRequired(assignment.task, assignment.rationale),
      state: 'queued',
      dispatchedAt: null,
      completedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      checkpoint: null,
      lastHeartbeatAt: null,
      lastOutputAt: null,
      blockerReason: null,
      staleReason: null,
    })
  }
  mission.updatedAt = now()
  mission.state = deriveMissionState(mission)
  writeStore(store)
  return Object.assign(mission, { _created: createdMission })
}

export function markMissionAssignmentDispatched(input: {
  missionId: string
  workerId: string
  task: string
  source?: string | null
  author?: string | null
}): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  if (mission.state === 'cancelled' || mission.state === 'complete') return mission
  const assignment = mission.assignments.find((item) => item.workerId === input.workerId && item.task === input.task)
  if (!assignment) return null
  if (isTerminalAssignment(assignment)) return mission
  const dispatchedAt = now()
  assignment.state = 'dispatched'
  assignment.dispatchedAt = dispatchedAt
  assignment.lastHeartbeatAt = dispatchedAt
  assignment.blockerReason = null
  assignment.staleReason = null
  mission.dispatchState = 'dispatching'
  mission.dispatchRequestedAt ??= dispatchedAt
  mission.dispatchStartedAt ??= dispatchedAt
  mission.dispatchLastHeartbeatAt = dispatchedAt
  const dispatchEvt = event('assignment_dispatched', `Dispatched ${assignment.id} to ${input.workerId}`, {
    workerId: input.workerId,
    assignmentId: assignment.id,
    data: {
      task: assignment.task,
      source: input.source?.trim() || 'swarm-dispatch',
      author: input.author?.trim() || 'aurora',
    },
  })
  mission.events.push(dispatchEvt)
  mission.updatedAt = dispatchedAt
  mission.state = deriveMissionState(mission)
  writeStore(store)
  publishMissionEvent(mission, dispatchEvt)
  return mission
}

export type RecordCheckpointResult = (SwarmMission & { _completed?: boolean; _ignoredReason?: string }) | null

export function recordMissionCheckpoint(input: {
  missionId?: string | null
  assignmentId?: string | null
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
  source?: string | null
}): RecordCheckpointResult {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  if (mission.state === 'cancelled') return Object.assign(mission, { _ignoredReason: 'mission cancelled' })
  const assignment = (input.assignmentId
    ? mission.assignments.find((item) => item.id === input.assignmentId)
    : null)
    ?? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId && item.state !== 'done')
    ?? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId)
  if (!assignment) return null
  if (assignment.state === 'cancelled') return Object.assign(mission, { _ignoredReason: 'assignment cancelled' })
  if (assignment.state === 'done') return Object.assign(mission, { _ignoredReason: 'assignment done' })
  if (assignment.checkpoint?.raw === input.checkpoint.raw) {
    return Object.assign(mission, { _completed: mission.state === 'complete' })
  }
  const checkpoint = normalizeCheckpointRecord(input.checkpoint) ?? input.checkpoint
  const checkpointedAt = now()
  assignment.checkpoint = checkpoint
  assignment.completedAt = checkpointedAt
  assignment.lastHeartbeatAt = checkpointedAt
  assignment.lastOutputAt = checkpointedAt
  assignment.state = checkpoint.stateLabel === 'BLOCKED'
    ? 'blocked'
    : checkpoint.stateLabel === 'NEEDS_INPUT'
      ? 'needs_input'
      : checkpoint.stateLabel === 'IN_PROGRESS'
        ? 'executing'
        : 'checkpointed'
  assignment.blockerReason = normalizeOptionalText(checkpoint.blocker)
  assignment.staleReason = null
  const report = reportFromCheckpoint({
    missionId: mission.id,
    assignmentId: assignment.id,
    workerId: input.workerId,
    checkpoint,
    source: input.source,
  })
  const checkpointEvt = event('checkpoint', `${input.workerId} checkpointed: ${checkpoint.stateLabel}`, {
    workerId: input.workerId,
    assignmentId: assignment.id,
    data: report,
  })
  mission.events.push(checkpointEvt)
  mission.updatedAt = checkpointedAt
  const previousState = mission.state
  mission.dispatchLastOutputAt = checkpointedAt
  mission.dispatchLastHeartbeatAt = checkpointedAt
  mission.dispatchReason = normalizeOptionalText(checkpoint.blocker) ?? mission.dispatchReason
  mission.state = deriveMissionState(mission)
  const completed = mission.state === 'complete' && previousState !== 'complete'
  writeStore(store)
  publishMissionEvent(mission, checkpointEvt)
  if (checkpoint.filesChanged) {
    for (const filePath of checkpoint.filesChanged.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)) {
      publishSwarmEvent({
        kind: 'file_edit',
        missionId: mission.id,
        assignmentId: assignment.id,
        workerId: input.workerId,
        ts: checkpointedAt,
        payload: { path: filePath, stat: null },
      })
    }
  }
  if (checkpoint.commandsRun) {
    for (const cmd of checkpoint.commandsRun.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)) {
      publishSwarmEvent({
        kind: 'tool_use',
        missionId: mission.id,
        assignmentId: assignment.id,
        workerId: input.workerId,
        ts: checkpointedAt,
        payload: { tool: 'Bash', input: cmd },
      })
    }
  }
  return Object.assign(mission, { _completed: completed })
}

export function recordMissionAssignmentBlocked(input: {
  missionId?: string | null
  assignmentId?: string | null
  workerId: string
  reason?: string | null
  source?: string | null
}): { mission: SwarmMission; assignment: SwarmMissionAssignment; changed: boolean } | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  if (mission.state === 'cancelled' || mission.state === 'complete') return null
  const assignment = (input.assignmentId
    ? mission.assignments.find((item) => item.id === input.assignmentId)
    : null)
    ?? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId && !isTerminalAssignment(item))
    ?? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId)
  if (!assignment) return null
  if (assignment.state === 'cancelled' || assignment.state === 'done') return { mission, assignment, changed: false }

  const reason = input.reason?.trim() || 'Dispatch failed before a worker checkpoint was recorded.'
  const blockedAt = now()
  const checkpoint: ParsedSwarmCheckpoint = {
    stateLabel: 'BLOCKED',
    runtimeState: 'blocked',
    checkpointStatus: 'blocked',
    filesChanged: 'none',
    commandsRun: 'none',
    result: null,
    blocker: reason,
    nextAction: 'Fix blocker and retry dispatch.',
    raw: `STATE: BLOCKED\nFILES_CHANGED: none\nCOMMANDS_RUN: none\nRESULT: none\nBLOCKER: ${reason}\nNEXT_ACTION: Fix blocker and retry dispatch.`,
  }
  const changed = assignment.state !== 'blocked' || assignment.checkpoint?.raw !== checkpoint.raw
  assignment.state = 'blocked'
  assignment.completedAt = blockedAt
  assignment.lastHeartbeatAt = blockedAt
  assignment.lastOutputAt = blockedAt
  assignment.blockerReason = reason
  assignment.staleReason = null
  assignment.checkpoint = checkpoint
  const report = reportFromCheckpoint({
    missionId: mission.id,
    assignmentId: assignment.id,
    workerId: input.workerId,
    checkpoint,
    source: input.source,
  })
  if (changed) {
    const blockedEvt = event('blocked', `${input.workerId} blocked: ${reason}`, {
      workerId: input.workerId,
      assignmentId: assignment.id,
      data: report,
    })
    mission.events.push(blockedEvt)
    mission.updatedAt = blockedAt
    mission.dispatchLastHeartbeatAt = blockedAt
    mission.dispatchReason = reason
    mission.dispatchState = 'blocked'
    mission.state = deriveMissionState(mission)
    writeStore(store)
    publishMissionEvent(mission, blockedEvt)
  } else {
    mission.updatedAt = blockedAt
    mission.dispatchLastHeartbeatAt = blockedAt
    mission.dispatchReason = reason
    mission.dispatchState = 'blocked'
    mission.state = deriveMissionState(mission)
    writeStore(store)
  }
  return { mission, assignment, changed }
}

export function recordMissionAssignmentStale(input: {
  missionId?: string | null
  assignmentId?: string | null
  workerId: string
  reason?: string | null
  source?: string | null
}): { mission: SwarmMission; assignment: SwarmMissionAssignment; changed: boolean } | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  if (mission.state === 'cancelled' || mission.state === 'complete') return null
  const assignment = (input.assignmentId
    ? mission.assignments.find((item) => item.id === input.assignmentId)
    : null)
    ?? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId && !isTerminalAssignment(item))
    ?? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId)
  if (!assignment) return null
  if (assignment.state === 'cancelled' || assignment.state === 'done') return { mission, assignment, changed: false }

  const reason = input.reason?.trim() || 'No fresh heartbeat or output was observed.'
  const staleAt = now()
  const checkpoint: ParsedSwarmCheckpoint = {
    stateLabel: 'BLOCKED',
    runtimeState: 'blocked',
    checkpointStatus: 'blocked',
    filesChanged: 'none',
    commandsRun: 'none',
    result: null,
    blocker: reason,
    nextAction: 'Recover or requeue the assignment.',
    raw: `STATE: BLOCKED\nFILES_CHANGED: none\nCOMMANDS_RUN: none\nRESULT: none\nBLOCKER: ${reason}\nNEXT_ACTION: Recover or requeue the assignment.`,
  }
  const changed = assignment.state !== 'stale' || assignment.staleReason !== reason
  assignment.state = 'stale'
  assignment.completedAt = staleAt
  assignment.lastHeartbeatAt = staleAt
  assignment.lastOutputAt = staleAt
  assignment.blockerReason = reason
  assignment.staleReason = reason
  assignment.checkpoint = checkpoint
  if (changed) {
    mission.events.push(event('blocked', `${input.workerId} stale: ${reason}`, {
      workerId: input.workerId,
      assignmentId: assignment.id,
      data: reportFromCheckpoint({
        missionId: mission.id,
        assignmentId: assignment.id,
        workerId: input.workerId,
        checkpoint,
        source: input.source,
      }),
    }))
  }
  mission.updatedAt = staleAt
  mission.dispatchLastHeartbeatAt = staleAt
  mission.dispatchReason = reason
  mission.dispatchState = 'stale'
  mission.state = deriveMissionState(mission)
  writeStore(store)
  return { mission, assignment, changed }
}

export function getMissionAssignmentContext(input: {
  missionId?: string | null
  assignmentId?: string | null
  workerId?: string | null
}): { mission: SwarmMission | null; assignment: SwarmMissionAssignment | null; dependency: { ready: boolean; waitingOn: Array<string>; blocker: string | null } | null; lifecycle: { state: SwarmMissionAssignmentState; blockerReason: string | null; staleReason: string | null } | null } {
  if (!input.missionId) return { mission: null, assignment: null, dependency: null, lifecycle: null }
  const mission = getSwarmMission(input.missionId)
  if (!mission) return { mission: null, assignment: null, dependency: null, lifecycle: null }
  const assignment = (input.assignmentId
    ? mission.assignments.find((item) => item.id === input.assignmentId)
    : null)
    ?? (input.workerId ? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId) : null)
    ?? null
  if (!assignment) return { mission, assignment: null, dependency: null, lifecycle: null }
  return {
    mission,
    assignment,
    dependency: dependencySummaryForAssignment({ mission, assignment }),
    lifecycle: assignmentLifecycleState({ mission, assignment }),
  }
}

export function touchMissionAssignmentHeartbeat(input: {
  missionId?: string | null
  assignmentId?: string | null
  workerId: string
  heartbeatAt?: number | null
  outputAt?: number | null
  source?: string | null
}): SwarmMission | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const assignment = (input.assignmentId
    ? mission.assignments.find((item) => item.id === input.assignmentId)
    : null)
    ?? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId)
    ?? null
  if (!assignment) return null
  if (typeof input.heartbeatAt === 'number' && Number.isFinite(input.heartbeatAt) && assignment.lastHeartbeatAt !== input.heartbeatAt) {
    assignment.lastHeartbeatAt = input.heartbeatAt
  }
  if (typeof input.outputAt === 'number' && Number.isFinite(input.outputAt) && assignment.lastOutputAt !== input.outputAt) {
    assignment.lastOutputAt = input.outputAt
  }
  mission.dispatchLastHeartbeatAt = assignment.lastHeartbeatAt ?? mission.dispatchLastHeartbeatAt
  mission.dispatchLastOutputAt = assignment.lastOutputAt ?? mission.dispatchLastOutputAt
  if (assignment.state === 'dispatched') assignment.state = 'executing'
  mission.updatedAt = now()
  mission.state = deriveMissionState(mission)
  writeStore(store)
  return mission
}

export function startMissionDispatchRun(input: {
  missionId?: string | null
  reason?: string | null
}): SwarmMission | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  if (mission.state === 'cancelled' || mission.state === 'complete') return mission
  const startedAt = now()
  mission.runId = shortId('run')
  mission.dispatchState = 'queued'
  mission.dispatchRequestedAt = startedAt
  mission.dispatchStartedAt = startedAt
  mission.dispatchCompletedAt = null
  mission.dispatchLastHeartbeatAt = startedAt
  mission.dispatchLastOutputAt = null
  mission.dispatchReason = input.reason?.trim() || null
  mission.updatedAt = startedAt
  mission.state = deriveMissionState(mission)
  writeStore(store)
  return mission
}

export function appendMissionContinuation(input: {
  missionId?: string | null
  workerId: string
  task: string
  rationale: string
}): SwarmMission | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  if (mission.state === 'cancelled') return null
  const id = shortId('assign')
  mission.assignments.push({
    id,
    workerId: input.workerId,
    task: input.task,
    rationale: input.rationale,
    dependsOn: [],
    reviewRequired: false,
    state: 'queued',
    dispatchedAt: null,
    completedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    checkpoint: null,
    lastHeartbeatAt: null,
    lastOutputAt: null,
    blockerReason: null,
    staleReason: null,
  })
  mission.events.push(event('continuation', `Queued continuation ${id} for ${input.workerId}`, { workerId: input.workerId, assignmentId: id }))
  mission.updatedAt = now()
  mission.state = deriveMissionState(mission)
  writeStore(store)
  return mission
}

export function readyQueuedAssignments(missionId: string): Array<SwarmMissionAssignment> {
  const mission = getSwarmMission(missionId)
  if (!mission) return []
  return mission.assignments.filter((item) => {
    if (item.state !== 'queued') return false
    return dependencySummaryForAssignment({ mission, assignment: item }).ready
  })
}

export function cancelSwarmAssignment(input: {
  missionId?: string | null
  assignmentId?: string | null
  workerId?: string | null
  actor?: string | null
  reason?: string | null
}): { mission: SwarmMission; assignment: SwarmMissionAssignment; changed: boolean } | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const assignment = (input.assignmentId
    ? mission.assignments.find((item) => item.id === input.assignmentId)
    : null)
    ?? (input.workerId ? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId && !isTerminalAssignment(item)) : null)
    ?? null
  if (!assignment) return null
  if (assignment.state === 'cancelled') return { mission, assignment, changed: false }
  const cancelledAt = now()
  assignment.state = 'cancelled'
  assignment.completedAt = cancelledAt
  assignment.reviewedAt = cancelledAt
  assignment.reviewedBy = input.actor?.trim() || 'system-cancel'
  const cancelAssignEvt = event('assignment_cancelled', `Cancelled ${assignment.id}${input.reason ? `: ${input.reason}` : ''}`, {
    workerId: assignment.workerId,
    assignmentId: assignment.id,
    data: {
      actor: input.actor?.trim() || 'system-cancel',
      reason: input.reason?.trim() || null,
    },
  })
  mission.events.push(cancelAssignEvt)
  mission.updatedAt = cancelledAt
  mission.state = deriveMissionState(mission)
  writeStore(store)
  publishMissionEvent(mission, cancelAssignEvt)
  return { mission, assignment, changed: true }
}

export function cancelSwarmMission(input: {
  missionId?: string | null
  actor?: string | null
  reason?: string | null
}): { mission: SwarmMission; cancelledAssignmentIds: Array<string>; changed: boolean } | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const cancelledAt = now()
  const cancelledAssignmentIds: Array<string> = []
  for (const assignment of mission.assignments) {
    if (isTerminalAssignment(assignment)) continue
    assignment.state = 'cancelled'
    assignment.completedAt = cancelledAt
    assignment.reviewedAt = cancelledAt
    assignment.reviewedBy = input.actor?.trim() || 'system-cancel'
    cancelledAssignmentIds.push(assignment.id)
  }
  mission.state = 'cancelled'
  mission.updatedAt = cancelledAt
  const cancelMissionEvt = event('mission_cancelled', `Cancelled mission${input.reason ? `: ${input.reason}` : ''}`, {
    data: {
      actor: input.actor?.trim() || 'system-cancel',
      reason: input.reason?.trim() || null,
      cancelledAssignmentIds,
    },
  })
  mission.events.push(cancelMissionEvt)
  writeStore(store)
  publishMissionEvent(mission, cancelMissionEvt)
  return { mission, cancelledAssignmentIds, changed: cancelledAssignmentIds.length > 0 }
}

export function markMissionAssignmentReviewed(input: { missionId?: string | null; assignmentId: string; reviewerId?: string }): SwarmMission | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const assignment = mission.assignments.find((item) => item.id === input.assignmentId)
  if (!assignment) return null
  assignment.state = 'done'
  assignment.reviewedAt = now()
  assignment.reviewedBy = input.reviewerId ?? null
  mission.events.push(event('review', `Reviewed ${assignment.id}${input.reviewerId ? ` by ${input.reviewerId}` : ''}`, { workerId: input.reviewerId, assignmentId: assignment.id }))
  mission.updatedAt = now()
  mission.state = deriveMissionState(mission)
  writeStore(store)
  return mission
}

export function markMissionAssignmentsReviewedByWorker(input: {
  missionId?: string | null
  reviewerId: string
  excludeAssignmentId?: string | null
}): { mission: SwarmMission; reviewedAssignmentIds: Array<string> } | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null

  const reviewedAt = now()
  const reviewed = mission.assignments.filter((assignment) => (
    assignment.id !== input.excludeAssignmentId
    && assignment.workerId !== input.reviewerId
    && assignment.reviewRequired
    && assignment.state === 'checkpointed'
  ))

  if (reviewed.length === 0) return { mission, reviewedAssignmentIds: [] }

  for (const assignment of reviewed) {
    assignment.state = 'done'
    assignment.reviewedAt = reviewedAt
    assignment.reviewedBy = input.reviewerId
    mission.events.push(event('review', `Reviewed ${assignment.id} by ${input.reviewerId}`, {
      workerId: input.reviewerId,
      assignmentId: assignment.id,
    }))
  }

  mission.updatedAt = reviewedAt
  mission.state = deriveMissionState(mission)
  writeStore(store)
  return { mission, reviewedAssignmentIds: reviewed.map((assignment) => assignment.id) }
}

export function reconcileSwarmMissions(input?: {
  staleMs?: number
  heartbeatMs?: number
}): {
  staleAssignments: Array<{ missionId: string; assignmentId: string; workerId: string; reason: string }>
  blockedAssignments: Array<{ missionId: string; assignmentId: string; workerId: string; reason: string }>
  waitingAssignments: Array<{ missionId: string; assignmentId: string; workerId: string }>
  updatedMissionIds: Array<string>
} {
  const store = readStore()
  const staleAssignments: Array<{ missionId: string; assignmentId: string; workerId: string; reason: string }> = []
  const blockedAssignments: Array<{ missionId: string; assignmentId: string; workerId: string; reason: string }> = []
  const waitingAssignments: Array<{ missionId: string; assignmentId: string; workerId: string }> = []
  const updatedMissionIds: Array<string> = []
  const staleMs = Math.max(30_000, input?.staleMs ?? 5 * 60_000)
  const heartbeatMs = Math.max(5_000, input?.heartbeatMs ?? 30_000)
  const nowAt = now()

  for (const mission of store.missions) {
    if (mission.state === 'cancelled' || mission.state === 'complete') continue
    let missionChanged = false
    let lastHeartbeat: number | null = mission.dispatchLastHeartbeatAt ?? null
    let lastOutput: number | null = mission.dispatchLastOutputAt ?? null

    for (const assignment of mission.assignments) {
      if (assignment.state === 'cancelled' || assignment.state === 'done') continue

      const dependency = dependencySummaryForAssignment({ mission, assignment })
      if (!dependency.ready) {
        if (dependency.blocker?.startsWith('Waiting on dependency:')) {
          if (assignment.state !== 'waiting_on_dependency') {
            assignment.state = 'waiting_on_dependency'
            assignment.blockerReason = null
            assignment.staleReason = null
            missionChanged = true
            waitingAssignments.push({ missionId: mission.id, assignmentId: assignment.id, workerId: assignment.workerId })
          }
        } else if (dependency.blocker) {
          if (assignment.state !== 'blocked' || assignment.blockerReason !== dependency.blocker) {
            assignment.state = 'blocked'
            assignment.blockerReason = dependency.blocker
            assignment.staleReason = null
            assignment.completedAt = assignment.completedAt ?? nowAt
            assignment.lastHeartbeatAt = assignment.lastHeartbeatAt ?? nowAt
            assignment.lastOutputAt = assignment.lastOutputAt ?? nowAt
            assignment.checkpoint = assignment.checkpoint ?? {
              stateLabel: 'BLOCKED',
              runtimeState: 'blocked',
              checkpointStatus: 'blocked',
              filesChanged: 'none',
              commandsRun: 'none',
              result: null,
              blocker: dependency.blocker,
              nextAction: 'Fix dependency and retry dispatch.',
              raw: `STATE: BLOCKED\nFILES_CHANGED: none\nCOMMANDS_RUN: none\nRESULT: none\nBLOCKER: ${dependency.blocker}\nNEXT_ACTION: Fix dependency and retry dispatch.`,
            }
            missionChanged = true
            blockedAssignments.push({ missionId: mission.id, assignmentId: assignment.id, workerId: assignment.workerId, reason: dependency.blocker })
          }
        }
        continue
      }

      if (assignment.state === 'waiting_on_dependency') {
        assignment.state = 'queued'
        assignment.blockerReason = null
        missionChanged = true
      }

      if (assignment.state !== 'dispatched' && assignment.state !== 'executing' && assignment.state !== 'queued') continue

      const profilePath = join(getProfilesDir(), assignment.workerId)
      const { runtime } = readSwarmRuntimeFile(profilePath, assignment.workerId, { workspaceRoot: process.cwd() })
      const heartbeatAt = runtime.lastOutputAt ?? (runtime.lastCheckIn ? Date.parse(runtime.lastCheckIn) : null)
      if (typeof heartbeatAt === 'number' && Number.isFinite(heartbeatAt)) {
        if (assignment.lastHeartbeatAt !== heartbeatAt) {
          assignment.lastHeartbeatAt = heartbeatAt
          missionChanged = true
        }
        lastHeartbeat = heartbeatAt
      }
      if (typeof runtime.lastOutputAt === 'number' && Number.isFinite(runtime.lastOutputAt)) {
        if (assignment.lastOutputAt !== runtime.lastOutputAt) {
          assignment.lastOutputAt = runtime.lastOutputAt
          missionChanged = true
        }
        lastOutput = runtime.lastOutputAt
      }
      if (runtime.blockedReason || runtime.needsHuman || runtime.checkpointStatus === 'blocked') {
        const reason = runtime.blockedReason ?? 'Worker reported blocked.'
        if (assignment.state !== 'blocked' || assignment.blockerReason !== reason) {
          assignment.state = 'blocked'
          assignment.blockerReason = reason
          assignment.staleReason = null
          assignment.completedAt = assignment.completedAt ?? nowAt
          missionChanged = true
          blockedAssignments.push({ missionId: mission.id, assignmentId: assignment.id, workerId: assignment.workerId, reason })
        }
        continue
      }

      const ageMs = typeof heartbeatAt === 'number' && Number.isFinite(heartbeatAt) ? nowAt - heartbeatAt : Number.POSITIVE_INFINITY
      if (ageMs > staleMs || (assignment.dispatchedAt && nowAt - assignment.dispatchedAt > heartbeatMs && !runtime.currentTask)) {
        const reason = `No fresh heartbeat for ${Math.round(staleMs / 1000)}s.`
        if (assignment.state !== 'stale' || assignment.staleReason !== reason) {
          assignment.state = 'stale'
          assignment.staleReason = reason
          assignment.blockerReason = reason
          assignment.completedAt = assignment.completedAt ?? nowAt
          missionChanged = true
          staleAssignments.push({ missionId: mission.id, assignmentId: assignment.id, workerId: assignment.workerId, reason })
        }
        continue
      }

      if (assignment.state === 'dispatched') {
        assignment.state = 'executing'
        missionChanged = true
      }
    }

    const activeStates = new Set<SwarmMissionAssignmentState>(['queued', 'waiting_on_dependency', 'dispatched', 'executing'])
    const hasActive = mission.assignments.some((item) => activeStates.has(item.state))
    const derivedState = deriveMissionState(mission)
    mission.dispatchLastHeartbeatAt = lastHeartbeat
    mission.dispatchLastOutputAt = lastOutput
    mission.dispatchState = mission.assignments.some((item) => item.state === 'stale')
      ? 'stale'
      : mission.assignments.some((item) => item.state === 'blocked' || item.state === 'needs_input')
        ? 'blocked'
        : derivedState === 'complete'
          ? 'done'
          : hasActive
            ? 'dispatching'
            : 'idle'
    mission.dispatchReason = mission.assignments.find((item) => item.staleReason || item.blockerReason)?.staleReason ?? mission.assignments.find((item) => item.blockerReason)?.blockerReason ?? null
    mission.state = derivedState
    if (missionChanged) {
      mission.updatedAt = nowAt
      updatedMissionIds.push(mission.id)
    }
  }

  if (updatedMissionIds.length > 0) {
    writeStore(store)
  }

  return { staleAssignments, blockedAssignments, waitingAssignments, updatedMissionIds }
}

export function listSwarmReports(input?: {
  missionId?: string | null
  workerId?: string | null
  limit?: number
}): Array<SwarmCheckpointReport> {
  const limit = Math.max(1, Math.min(500, input?.limit ?? 100))
  const mission = input?.missionId ? getSwarmMission(input.missionId) : null
  const missions = mission ? [mission] : readStore().missions

  return missions
    .flatMap((entry) => entry.events)
    .filter((event) => event.type === 'checkpoint' && event.data)
    .map((event) => normalizeReportRecord(event.data as SwarmCheckpointReport))
    .filter((report) => !input?.workerId || report.workerId === input.workerId)
    .sort((a, b) => b.recordedAt - a.recordedAt)
    .slice(0, limit)
}

export function archiveSwarmMission(missionId: string): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((m) => m.id === missionId)
  if (!mission || mission.deletedAt) return null
  if (mission.archivedAt) return mission
  mission.archivedAt = now()
  mission.updatedAt = now()
  writeStore(store)
  return mission
}

export function unarchiveSwarmMission(missionId: string): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((m) => m.id === missionId)
  if (!mission || !mission.archivedAt) return mission ?? null
  mission.archivedAt = null
  mission.updatedAt = now()
  writeStore(store)
  return mission
}

export function deleteSwarmMission(missionId: string): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((m) => m.id === missionId)
  if (!mission) return null
  if (mission.deletedAt) return mission
  mission.deletedAt = now()
  mission.updatedAt = now()
  writeStore(store)
  return mission
}

export function listArchivedMissions(): Array<SwarmMission> {
  return readStore().missions.filter((m) => m.archivedAt && !m.deletedAt)
}
