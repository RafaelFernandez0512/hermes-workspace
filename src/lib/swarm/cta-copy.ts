import type { CanonicalSwarmStatus } from './canonical-state'

export const CTA = {
  START_OR_RESUME: 'Start / Resume Swarm',
  SEND_GUIDANCE: 'Send guidance',
  REROUTE: 'Reroute',
  ESCALATE_REVIEW: 'Escalate for review',
  OPEN_INCIDENT: 'Open incident',
  VIEW_DETAILS: 'View details',
  APPROVE_MARK_READY: 'Approve & mark ready',
  MARK_COMPLETE: 'Mark complete',
  OPEN_PR: 'Open PR',
  RECOVER_RUNTIME: 'Recover runtime',
  RETRY_WORKER: 'Retry worker',
  VIEW_WORKER: 'View worker',
  PAUSE: 'Pause',
  VIEW_WORKERS: 'View workers',
  VIEW_LOGS: 'View logs',
} as const

export function incidentCtaFor(status: CanonicalSwarmStatus): string {
  const incidentStatuses: CanonicalSwarmStatus[] = ['blocked', 'failed', 'needs_review', 'stale']
  return incidentStatuses.includes(status) ? CTA.OPEN_INCIDENT : CTA.VIEW_DETAILS
}
