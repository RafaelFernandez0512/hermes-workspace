export type CanonicalSwarmStatus =
  | 'not_started' | 'starting' | 'running' | 'blocked'
  | 'needs_review' | 'ready' | 'completed' | 'paused'
  | 'recovering' | 'failed' | 'stale'

export type RecommendedAction =
  | { kind: 'start_or_resume' }
  | { kind: 'send_guidance'; workerId: string }
  | { kind: 'reroute'; workerId: string }
  | { kind: 'escalate_review'; workerId: string }
  | { kind: 'mark_ready' }
  | { kind: 'mark_complete' }
  | { kind: 'recover_runtime' }
  | { kind: 'retry_failed'; workerId: string }
  | { kind: 'view_only' }

export interface SwarmStatusPayload {
  swarmId: string
  status: CanonicalSwarmStatus
  phase: string
  currentWorkerId: string | null
  blockedReason: string | null
  lastHeartbeatAt: number
  isStale: boolean
  recommendedAction: RecommendedAction
}

export const STALE_MS = 45_000

export const REAL_INCIDENT_STATUSES: Array<CanonicalSwarmStatus> = ['blocked', 'failed', 'needs_review', 'recovering', 'stale']

export function isRealIncidentStatus(status: CanonicalSwarmStatus): boolean {
  return REAL_INCIDENT_STATUSES.includes(status)
}

export function projectCanonicalStatus(params: {
  lifecycle: { status: string; pausedAt?: number | null } | null
  workers: Array<{ id: string; status: string; failedAt?: number | null }>
  checkpoints: Array<{ status: string; workerId: string }>
  lastHeartbeatAt: number
  sessionStartedAt?: number | null
  now?: number
}): Pick<SwarmStatusPayload, 'status' | 'isStale' | 'recommendedAction' | 'currentWorkerId' | 'blockedReason'> {
  const now = params.now ?? Date.now()
  const { lifecycle, workers, checkpoints } = params

  if (!lifecycle) {
    return { status: 'not_started', isStale: false, recommendedAction: { kind: 'start_or_resume' }, currentWorkerId: null, blockedReason: null }
  }

  const isStale = params.lastHeartbeatAt > 0 && (now - params.lastHeartbeatAt) > STALE_MS

  if (lifecycle.pausedAt) {
    return { status: 'paused', isStale, recommendedAction: { kind: 'start_or_resume' }, currentWorkerId: null, blockedReason: null }
  }

  const failedWorker = workers.find(w => w.status === 'failed')
  const blockedWorker = workers.find(w => w.status === 'handoff_required')
  const activeWorker = workers.find(w => w.status === 'active')
  const awaitingReviewCheckpoint = checkpoints.find(c => c.status === 'awaiting_review')
  const approvedCheckpoint = checkpoints.find(c => c.status === 'approved')
  const allCompleted = checkpoints.length > 0 && checkpoints.every(c => c.status === 'completed') && lifecycle.status === 'healthy'

  if (lifecycle.status === 'renew_required') {
    const workerId = activeWorker ? activeWorker.id : null
    return { status: 'recovering', isStale, recommendedAction: { kind: 'recover_runtime' }, currentWorkerId: workerId, blockedReason: 'Runtime renewal required' }
  }

  if (allCompleted) {
    return { status: 'completed', isStale: false, recommendedAction: { kind: 'view_only' }, currentWorkerId: null, blockedReason: null }
  }

  if (failedWorker && !activeWorker) {
    return { status: 'failed', isStale, recommendedAction: { kind: 'retry_failed', workerId: failedWorker.id }, currentWorkerId: failedWorker.id, blockedReason: null }
  }

  if (lifecycle.status === 'handoff_required' || blockedWorker) {
    const w = blockedWorker ?? activeWorker ?? workers[0] ?? null
    const workerId = w ? w.id : ''
    return { status: 'blocked', isStale, recommendedAction: { kind: 'send_guidance', workerId }, currentWorkerId: w ? w.id : null, blockedReason: 'Worker blocked and waiting for guidance' }
  }

  if (awaitingReviewCheckpoint) {
    return { status: 'needs_review', isStale, recommendedAction: { kind: 'mark_ready' }, currentWorkerId: awaitingReviewCheckpoint.workerId, blockedReason: null }
  }

  if (approvedCheckpoint && !activeWorker) {
    return { status: 'ready', isStale, recommendedAction: { kind: 'mark_complete' }, currentWorkerId: null, blockedReason: null }
  }

  // running or starting
  if (isStale) {
    return { status: 'stale', isStale: true, recommendedAction: { kind: 'recover_runtime' }, currentWorkerId: activeWorker?.id ?? null, blockedReason: 'No heartbeat in 45s' }
  }

  const hasOutput = workers.some(w => w.status !== 'idle')
  const uptime = params.sessionStartedAt ? now - params.sessionStartedAt : Infinity
  if (!hasOutput && uptime < 30_000) {
    return { status: 'starting', isStale: false, recommendedAction: { kind: 'view_only' }, currentWorkerId: null, blockedReason: null }
  }

  return { status: 'running', isStale: false, recommendedAction: { kind: 'send_guidance', workerId: activeWorker?.id ?? '' }, currentWorkerId: activeWorker?.id ?? null, blockedReason: null }
}
