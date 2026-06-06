import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getSwarmLifecycleStatus } from '../../server/swarm-lifecycle'
import {
  listSwarmWorkerIds,
  getHeartbeat,
  readSwarmRuntimeFile,
  getSwarmProfilePath,
} from '../../server/swarm-foundation'
import {
  projectCanonicalStatus,
  type SwarmStatusPayload,
} from '../../lib/swarm/canonical-state'

export const Route = createFileRoute('/api/swarm-lifecycle/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        try {

        const url = new URL(request.url)
        const swarmId = url.searchParams.get('swarmId')?.trim() || ''

        const workerIds = listSwarmWorkerIds()
        const now = Date.now()

        // Build worker list from lifecycle status
        const workers = workerIds.map((wId) => {
          const ls = getSwarmLifecycleStatus(wId)
          const profilePath = getSwarmProfilePath(wId)
          const { runtime } = readSwarmRuntimeFile(profilePath, wId)
          let status = 'idle'
          if (ls.contextState === 'renew_required') status = 'failed'
          else if (ls.contextState === 'handoff_required') status = 'handoff_required'
          else if (runtime.state === 'executing' || runtime.state === 'thinking' || runtime.state === 'writing') status = 'active'
          else if (runtime.state === 'blocked') status = 'blocked'
          else if (runtime.state === 'idle') status = 'idle'
          else status = runtime.state
          return {
            id: wId,
            status,
            failedAt: ls.contextState === 'renew_required' ? now : null,
          }
        })

        // Build checkpoints from worker runtimes — map to canonical statuses
        const checkpoints = workerIds.flatMap((wId) => {
          const profilePath = getSwarmProfilePath(wId)
          const { runtime } = readSwarmRuntimeFile(profilePath, wId)
          const cs = runtime.checkpointStatus
          if (!cs || cs === 'none') return []
          // Map SwarmCheckpointStatus to canonical status strings
          let mappedStatus: string = cs
          if (cs === 'done') mappedStatus = 'completed'
          else if (cs === 'needs_input') mappedStatus = 'awaiting_review'
          else if (cs === 'handoff') mappedStatus = 'approved'
          return [{ status: mappedStatus, workerId: wId }]
        })

        // Get heartbeat — use first worker or swarmId
        const heartbeatKey = swarmId || workerIds[0] || ''
        const lastHeartbeatAt = getHeartbeat(heartbeatKey)

        // Try to get sessionStartedAt from first worker
        const firstWorkerRuntime = workerIds[0]
          ? readSwarmRuntimeFile(getSwarmProfilePath(workerIds[0]), workerIds[0]).runtime
          : null
        const sessionStartedAt = firstWorkerRuntime?.startedAt ?? null

        // Build lifecycle object
        const anyWorker = workerIds[0] ? getSwarmLifecycleStatus(workerIds[0]) : null
        const lifecycle = anyWorker
          ? {
              status: anyWorker.contextState,
              pausedAt: null,
            }
          : null

        const canonical = projectCanonicalStatus({
          lifecycle,
          workers,
          checkpoints,
          lastHeartbeatAt,
          sessionStartedAt,
          now,
        })

        // Determine phase from first active worker runtime
        const phase = (() => {
          for (const wId of workerIds) {
            const profilePath = getSwarmProfilePath(wId)
            const { runtime } = readSwarmRuntimeFile(profilePath, wId)
            if (runtime.phase && runtime.phase !== 'unknown') return runtime.phase
          }
          return 'unknown'
        })()

        const payload: SwarmStatusPayload = {
          swarmId: swarmId || workerIds[0] || 'default',
          status: canonical.status,
          phase,
          currentWorkerId: canonical.currentWorkerId,
          blockedReason: canonical.blockedReason,
          lastHeartbeatAt,
          isStale: canonical.isStale,
          recommendedAction: canonical.recommendedAction,
        }

        return json({ ok: true, ...payload })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const stack = err instanceof Error ? err.stack : undefined
          return json({ ok: false, error: msg, stack }, { status: 500 })
        }
      },
    },
  },
})
