import { createFileRoute } from '@tanstack/react-router'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { getTerminalSession } from '../../server/terminal-sessions'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../server/rate-limit'
import { resolveTerminalAdapter, getActiveTargetId } from '../../server/workspace-targets/resolver'
import { withTargetContext } from '../../server/workspace-targets/middleware'

export const Route = createFileRoute('/api/terminal-stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const ip = getClientIp(request)
        // A multi-pane Swarm2 runtime can open many attach sessions quickly,
        // especially after refreshes or when showing a 2xN grid of workers.
        // Keep abuse protection, but allow enough headroom for real runtime use.
        if (!rateLimit(`terminal-stream:${ip}`, 240, 60_000)) {
          return rateLimitResponse()
        }

        return withTargetContext(request, async () => {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const cwd =
            typeof body.cwd === 'string' && body.cwd.trim().length > 0
              ? body.cwd.trim()
              : undefined
          const cols =
            typeof body.cols === 'number'
              ? Math.max(20, Math.min(500, Math.floor(body.cols)))
              : undefined
          const rows =
            typeof body.rows === 'number'
              ? Math.max(5, Math.min(300, Math.floor(body.rows)))
              : undefined
          const command = Array.isArray(body.command)
            ? body.command.slice(0, 32).map((part) => String(part).slice(0, 2000))
            : undefined
          // Optional attach: if the client passes an existing sessionId that's
          // still alive, reattach to it instead of spawning a fresh PTY. Lets
          // browser tabs survive transient SSE disconnects without losing the
          // user's shell session. See #298.
          const attachSessionId =
            typeof body.sessionId === 'string' && body.sessionId.trim()
              ? body.sessionId.trim()
              : null

          const targetId = getActiveTargetId()

          // Resolve the terminal adapter for the active target.
          // For local targets this is a thin wrapper around createTerminalSession;
          // for SSH targets it opens a PTY over the remote connection.
          const adapter = await resolveTerminalAdapter()

          const encoder = new TextEncoder()
          const stream = new ReadableStream({
            async start(controller) {
              let isStreamActive = true
              let isReattach = false

              const send = (event: string, data: unknown) => {
                if (!isStreamActive || controller.desiredSize === null) return
                try {
                  controller.enqueue(
                    encoder.encode(
                      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                    ),
                  )
                } catch {
                  isStreamActive = false
                }
              }

              const existing = attachSessionId
                ? getTerminalSession(attachSessionId)
                : null

              let session: import('../../server/terminal-sessions').TerminalSession

              if (existing && (existing.targetId === targetId || targetId === undefined)) {
                session = existing
                isReattach = true
                session.markAttached()
              } else {
                try {
                  const { randomUUID } = await import('node:crypto')
                  session = await adapter.open({
                    sessionId: randomUUID(),
                    command,
                    cwd,
                    cols: cols ?? 80,
                    rows: rows ?? 24,
                  })
                } catch (error) {
                  if (import.meta.env.DEV)
                    console.error(
                      '[terminal-stream] Failed to create session:',
                      error,
                    )
                  send('error', { message: String(error) })
                  try {
                    controller.close()
                  } catch {
                    /* */
                  }
                  return
                }
              }

              send('session', { sessionId: session.id, reattach: isReattach })

              const handleEvent = (evt: { event: string; payload: unknown }) => {
                if (evt.event === 'data') {
                  send('data', evt.payload)
                } else if (evt.event === 'exit') {
                  send('exit', evt.payload)
                }
              }

              const handleClose = () => {
                send('close', { sessionId: session.id })
                if (!isStreamActive) return
                isStreamActive = false
                try {
                  controller.close()
                } catch {
                  /* */
                }
              }

              session.emitter.on('event', handleEvent)
              session.emitter.on('close', handleClose)

              const keepAlive = setInterval(() => {
                send('ping', { t: Date.now() })
              }, 8000)

              const abort = () => {
                isStreamActive = false
                clearInterval(keepAlive)
                session.emitter.off('event', handleEvent)
                session.emitter.off('close', handleClose)
                // DON'T close the PTY on SSE disconnect. Let it survive so
                // the user can reattach after a network blip / tab suspension /
                // HMR reload. The session reaps itself after DETACH_TTL_MS if
                // no client reattaches. See #298.
                session.markDetached()
              }

              request.signal.addEventListener('abort', abort)
            },
          })

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        })
      },
    },
  },
})
