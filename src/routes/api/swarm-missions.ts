import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFile } from 'node:child_process'
import { isAuthenticated } from '../../server/auth-middleware'
import { SWARM_CANONICAL_REPO } from '../../server/swarm-environment'
import { SWARM_MISSIONS_PATH, cancelSwarmAssignment, cancelSwarmMission, getSwarmMission, listSwarmMissions, listSwarmReports, reconcileSwarmMissions } from '../../server/swarm-missions'
import { resetSwarmWorkerRuntime } from '../../server/swarm-runtime-reset'
import { sendCtrlCToSession, forceKillSession } from './swarm-tmux-stop'
import { getSwarmProfilePath } from '../../server/swarm-foundation'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

type CancelPostBody = {
  action?: unknown
  missionId?: unknown
  assignmentId?: unknown
  workerId?: unknown
  reason?: unknown
  actor?: unknown
  resetWorkers?: unknown
  graceful?: unknown
  discardChanges?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const Route = createFileRoute('/api/swarm-missions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const id = url.searchParams.get('id')?.trim()
        const limitRaw = Number(url.searchParams.get('limit') ?? 20)
        const limit = Number.isFinite(limitRaw) ? limitRaw : 20
        const reconciliation = reconcileSwarmMissions()
        return json({
          ok: true,
          path: SWARM_MISSIONS_PATH,
          reconciliation,
          mission: id ? getSwarmMission(id) : null,
          missions: id ? [] : listSwarmMissions(limit),
          reports: id ? listSwarmReports({ missionId: id, limit }) : [],
          fetchedAt: Date.now(),
        })
      },
      POST: async ({ request }): Promise<Response> => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: CancelPostBody
        try {
          body = await request.json() as CancelPostBody
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }
        const action = cleanString(body.action)
        if (action !== 'cancel') return json({ ok: false, error: 'Unsupported action' }, { status: 400 })
        const missionId = cleanString(body.missionId)
        if (!missionId) return json({ ok: false, error: 'missionId required' }, { status: 400 })
        const actor = cleanString(body.actor) ?? 'workspace-cancel'
        const reason = cleanString(body.reason) ?? 'Cancelled from Workspace Swarm'
        const assignmentId = cleanString(body.assignmentId)
        const workerId = cleanString(body.workerId)
        const graceful = body.graceful !== false
        const discardChanges = body.discardChanges === true

        const result = assignmentId || workerId
          ? cancelSwarmAssignment({ missionId, assignmentId, workerId, actor, reason })
          : cancelSwarmMission({ missionId, actor, reason })
        if (!result) return json({ ok: false, error: 'Mission or assignment not found' }, { status: 404 })

        const workerIds = new Set<string>()
        if ('assignment' in result) workerIds.add(result.assignment.workerId)
        if ('cancelledAssignmentIds' in result) {
          const cancelledIds = new Set(result.cancelledAssignmentIds)
          for (const assignment of result.mission.assignments) {
            if (cancelledIds.has(assignment.id)) workerIds.add(assignment.workerId)
          }
        }
        if (workerId) workerIds.add(workerId)

        const gracefulResults: Array<{ workerId: string; ctrlC: boolean; killed: boolean }> = []
        if (graceful) {
          const GRACEFUL_TIMEOUT_MS = 30_000
          const POLL_INTERVAL_MS = 2_000
          await Promise.all(Array.from(workerIds).map(async (wId) => {
            const ctrlResult = await sendCtrlCToSession(wId)
            const started = Date.now()
            let idle = false
            while (Date.now() - started < GRACEFUL_TIMEOUT_MS) {
              await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS))
              const profilePath = getSwarmProfilePath(wId)
              const runtimePath = join(profilePath, 'runtime.json')
              if (existsSync(runtimePath)) {
                try {
                  const rt = JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
                  if (rt.state === 'idle' || rt.state === 'offline') { idle = true; break }
                } catch { /* ignore */ }
              }
            }
            const killResult = idle ? { ok: true } : await forceKillSession(wId)
            gracefulResults.push({ workerId: wId, ctrlC: ctrlResult.ok, killed: !idle || !killResult.ok })
          }))
        } else {
          await Promise.all(Array.from(workerIds).map(async (wId) => {
            const killResult = await forceKillSession(wId)
            gracefulResults.push({ workerId: wId, ctrlC: false, killed: killResult.ok })
          }))
        }

        const runtimeResets = body.resetWorkers !== false
          ? Array.from(workerIds).map((id) => resetSwarmWorkerRuntime(id, { actor, reason }))
          : []

        const discardResults: Array<{ path: string; ok: boolean; error?: string }> = []
        if (discardChanges) {
          const mission = getSwarmMission(missionId)
          if (mission) {
            const filePaths = new Set<string>()
            for (const evt of mission.events) {
              if (evt.type === 'checkpoint' && evt.data) {
                const report = evt.data as Record<string, unknown>
                const fc = typeof report.filesChanged === 'string' ? report.filesChanged : null
                if (fc && fc !== 'none') {
                  for (const p of fc.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)) {
                    filePaths.add(p)
                  }
                }
              }
            }
            const repoCwd = SWARM_CANONICAL_REPO
            await Promise.all(Array.from(filePaths).map((filePath) => {
              return new Promise<void>((res) => {
                execFile('git', ['-C', repoCwd, 'checkout', '--', filePath], { timeout: 10_000 }, (err) => {
                  if (err) {
                    discardResults.push({ path: filePath, ok: false, error: err.message })
                  } else {
                    discardResults.push({ path: filePath, ok: true })
                  }
                  res()
                })
              })
            }))
          }
        }

        return json({
          ok: true,
          action,
          graceful,
          discardChanges,
          result,
          runtimeResets,
          gracefulResults,
          discardResults,
          cancelledAt: Date.now(),
        })
      },
    },
  },
})
