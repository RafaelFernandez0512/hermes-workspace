import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getSwarmMission, cancelSwarmMission } from '../../server/swarm-missions'
import { publishSwarmEvent } from '../../server/swarm-event-bus'
import { dispatchSwarmAssignments } from './swarm-dispatch'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getSwarmProfilePath } from '../../server/swarm-foundation'

type AssignmentResponseBody = {
  missionId?: unknown
  assignmentId?: unknown
  action?: unknown
  feedback?: unknown
  rejectMode?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function patchRuntimeJson(profilePath: string, patch: Record<string, unknown>): void {
  const runtimePath = join(profilePath, 'runtime.json')
  let current: Record<string, unknown> = {}
  if (existsSync(runtimePath)) {
    try {
      current = JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
    } catch { /* ignore */ }
  }
  writeFileSync(runtimePath, JSON.stringify({ ...current, ...patch }, null, 2) + '\n')
}

export const Route = createFileRoute('/api/swarm-assignment-response')({
  server: {
    handlers: {
      POST: async ({ request }): Promise<Response> => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        let body: AssignmentResponseBody
        try {
          body = (await request.json()) as AssignmentResponseBody
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const missionId = cleanString(body.missionId)
        const assignmentId = cleanString(body.assignmentId)
        const action = cleanString(body.action)
        const feedback = cleanString(body.feedback)
        const rejectMode = cleanString(body.rejectMode) as 'retry' | 'skip' | 'terminate' | null

        if (!missionId) return json({ ok: false, error: 'missionId required' }, { status: 400 })
        if (!assignmentId) return json({ ok: false, error: 'assignmentId required' }, { status: 400 })
        if (action !== 'approve' && action !== 'reject') {
          return json({ ok: false, error: 'action must be approve or reject' }, { status: 400 })
        }
        if (action === 'reject' && !feedback) {
          return json({ ok: false, error: 'feedback required for reject' }, { status: 400 })
        }
        if (action === 'reject' && !rejectMode) {
          return json({ ok: false, error: 'rejectMode required for reject (retry|skip|terminate)' }, { status: 400 })
        }

        const mission = getSwarmMission(missionId)
        if (!mission) return json({ ok: false, error: 'Mission not found' }, { status: 404 })

        const assignment = mission.assignments.find((a) => a.id === assignmentId)
        if (!assignment) return json({ ok: false, error: 'Assignment not found' }, { status: 404 })

        if (action === 'approve') {
          const profilePath = getSwarmProfilePath(assignment.workerId)
          patchRuntimeJson(profilePath, {
            state: 'executing',
            checkpointStatus: 'in_progress',
            blockedReason: null,
            needsHuman: false,
          })

          publishSwarmEvent({
            kind: 'unblocked',
            missionId,
            assignmentId,
            workerId: assignment.workerId,
            ts: Date.now(),
            payload: { approvedBy: 'user' },
          })

          try {
            await dispatchSwarmAssignments({
              assignments: [{ workerId: assignment.workerId, task: assignment.task, assignmentId, direct: true }],
              missionId,
              allowAsync: true,
            })
          } catch (err) {
            return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
          }

          return json({ ok: true, action: 'approve', missionId, assignmentId })
        }

        if (action === 'reject') {
          if (rejectMode === 'terminate') {
            cancelSwarmMission({ missionId, actor: 'user-reject', reason: feedback ?? 'Rejected by user' })
            publishSwarmEvent({
              kind: 'cancelled',
              missionId,
              assignmentId,
              workerId: assignment.workerId,
              ts: Date.now(),
              payload: { reason: feedback, rejectMode },
            })
            return json({ ok: true, action: 'reject', rejectMode: 'terminate', missionId })
          }

          if (rejectMode === 'skip') {
            const profilePath = getSwarmProfilePath(assignment.workerId)
            patchRuntimeJson(profilePath, {
              state: 'idle',
              checkpointStatus: 'done',
              blockedReason: null,
              needsHuman: false,
              lastResult: `Skipped by user: ${feedback}`,
            })
            publishSwarmEvent({
              kind: 'unblocked',
              missionId,
              assignmentId,
              workerId: assignment.workerId,
              ts: Date.now(),
              payload: { skippedBy: 'user', feedback, rejectMode: 'skip' },
            })
            return json({ ok: true, action: 'reject', rejectMode: 'skip', missionId, assignmentId })
          }

          if (rejectMode === 'retry') {
            const taskWithFeedback = `${assignment.task}\n\n## User Feedback\n${feedback}`
            const profilePath = getSwarmProfilePath(assignment.workerId)
            patchRuntimeJson(profilePath, {
              state: 'executing',
              checkpointStatus: 'in_progress',
              blockedReason: null,
              needsHuman: false,
            })
            publishSwarmEvent({
              kind: 'unblocked',
              missionId,
              assignmentId,
              workerId: assignment.workerId,
              ts: Date.now(),
              payload: { retriedBy: 'user', feedback, rejectMode: 'retry' },
            })
            try {
              await dispatchSwarmAssignments({
                assignments: [{ workerId: assignment.workerId, task: taskWithFeedback, assignmentId, direct: true }],
                missionId,
                allowAsync: true,
              })
            } catch (err) {
              return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
            }
            return json({ ok: true, action: 'reject', rejectMode: 'retry', missionId, assignmentId })
          }
        }

        return json({ ok: false, error: 'Unhandled action/rejectMode combination' }, { status: 400 })
      },
    },
  },
})
