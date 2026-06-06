import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { subscribe } from '../../server/swarm-event-bus'
import { getSwarmMission } from '../../server/swarm-missions'
import { startLogTailForMission } from '../../server/swarm-log-tail'

export const Route = createFileRoute('/api/swarm-mission-events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const url = new URL(request.url)
        const missionId = url.searchParams.get('missionId')?.trim() || ''
        if (!missionId) {
          return new Response(
            JSON.stringify({ ok: false, error: 'missionId required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const encoder = new TextEncoder()
        let streamClosed = false
        let unsubscribe: (() => void) | null = null
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null

        const stream = new ReadableStream({
          start(controller) {
            const sendEvent = (event: string, data: unknown) => {
              if (streamClosed) return
              try {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                controller.enqueue(encoder.encode(payload))
              } catch {
                /* stream closed */
              }
            }

            const closeStream = () => {
              if (streamClosed) return
              streamClosed = true
              if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
              }
              if (unsubscribe) {
                unsubscribe()
                unsubscribe = null
              }
              try {
                controller.close()
              } catch {
                /* ignore */
              }
            }

            try {
              sendEvent('connected', { timestamp: Date.now(), missionId })

              const mission = getSwarmMission(missionId)
              if (mission) {
                sendEvent('mission_state', {
                  kind: 'mission_state',
                  missionId,
                  ts: Date.now(),
                  payload: { mission },
                })
                for (const assignment of mission.assignments) {
                  sendEvent('assignment_state', {
                    kind: 'assignment_state',
                    missionId,
                    assignmentId: assignment.id,
                    workerId: assignment.workerId,
                    ts: Date.now(),
                    payload: { assignment },
                  })
                }
                for (const evt of mission.events.slice(-200)) {
                  sendEvent('history', {
                    kind: evt.type === 'checkpoint'
                      ? 'checkpoint'
                      : evt.type === 'blocked'
                        ? 'blocked'
                        : evt.type === 'mission_cancelled' || evt.type === 'assignment_cancelled'
                          ? 'cancelled'
                          : evt.type === 'assignment_dispatched'
                            ? 'assignment_state'
                            : 'mission_state',
                    missionId,
                    assignmentId: evt.assignmentId,
                    workerId: evt.workerId,
                    ts: evt.at,
                    payload: { message: evt.message, data: evt.data ?? {} },
                  })
                }
              }

              if (mission) {
                startLogTailForMission(mission)
              }

              unsubscribe = subscribe(missionId, (evt) => {
                if (streamClosed) return
                sendEvent(evt.kind, evt)
              })

              heartbeatTimer = setInterval(() => {
                sendEvent('heartbeat', { kind: 'heartbeat', missionId, ts: Date.now(), payload: {} })
              }, 30_000)

              request.signal.addEventListener('abort', () => {
                closeStream()
              })
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err)
              sendEvent('error', { message: errorMsg })
              closeStream()
            }
          },
          cancel() {
            streamClosed = true
            if (heartbeatTimer) {
              clearInterval(heartbeatTimer)
              heartbeatTimer = null
            }
            if (unsubscribe) {
              unsubscribe()
              unsubscribe = null
            }
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
