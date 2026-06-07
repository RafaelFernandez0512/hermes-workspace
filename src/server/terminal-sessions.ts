/**
 * Terminal sessions using Python PTY helper.
 * Gives us real PTY (echo, colors, resize) without node-pty native addon.
 */
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import EventEmitter from 'node:events'
import type { ChildProcess } from 'node:child_process'

export type TerminalSessionEvent = {
  event: string
  payload: unknown
}

export type TerminalSession = {
  id: string
  createdAt: number
  emitter: EventEmitter
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
  /**
   * Mark that all live SSE listeners have detached. Starts an idle timer that
   * will reap the PTY if no listener reattaches in time. Lets the session
   * survive transient disconnects (network blips, browser tab suspension,
   * HMR reload) without killing the user's shell. See #298.
   */
  markDetached: () => void
  /** Cancel a pending detached-reap timer (called when a new listener attaches). */
  markAttached: () => void
}

// How long an unattached PTY session stays alive before it's reaped, in ms.
// Long enough to absorb tab suspension and short network blips, short enough
// that abandoned tabs don't pile up forever. Override with HERMES_TERMINAL_DETACH_TTL_MS.
const DETACH_TTL_MS = (() => {
  const raw = process.env.HERMES_TERMINAL_DETACH_TTL_MS
  const parsed = raw ? Number(raw) : NaN
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  return 5 * 60_000 // 5 minutes
})()

const sessions = new Map<string, TerminalSession>()

// Resolve path to pty-helper.py relative to this file
const __dirname_resolved =
  typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
const PTY_HELPER = resolve(__dirname_resolved, 'pty-helper.py')

function isTruthy(value?: string): boolean {
  switch ((value ?? '').trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true
    default:
      return false
  }
}

function shellQuote(value: string): string {
  if (value.length === 0) return "''"
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function shellJoin(parts: Array<string>): string {
  return parts.map(shellQuote).join(' ')
}

export function buildHostTerminalCommand(params: {
  sessionId: string
  command: Array<string>
  cols: number
  rows: number
  image?: string
  home?: string
  user?: string
  cwd?: string
  path?: string
}): Array<string> {
  const image = params.image?.trim() || 'debian:bookworm-slim'
  const home = params.home?.trim() || '/home/winterfell'
  const user = params.user?.trim() || 'winterfell'
  const cwd = params.cwd?.trim() || home
  const path =
    params.path?.trim() ||
    '/home/winterfell/.local/bin:/home/winterfell/.local/share/mise/shims:/usr/local/sbin:/usr/local/bin:/usr/bin:/bin'
  const command = params.command.length
    ? params.command
    : [process.env.SHELL ?? '/bin/bash', '-l']
  const mountedCwd = cwd.startsWith('/host/')
    ? cwd
    : `/host${cwd.startsWith('/') ? cwd : `/${cwd.replace(/^\/+/, '')}`}`

  const hostCommand = [
    'chroot',
    '/host',
    '/usr/bin/env',
    '-i',
    `HOME=${home}`,
    `USER=${user}`,
    `LOGNAME=${user}`,
    'SHELL=/bin/bash',
    'TERM=xterm-256color',
    'COLORTERM=truecolor',
    `COLUMNS=${String(params.cols)}`,
    `LINES=${String(params.rows)}`,
    `PATH=${path}`,
    '/bin/bash',
    '-lc',
    `exec ${shellJoin(command)}`,
  ]

  let socketGid: number | null = null
  try {
    socketGid = statSync('/var/run/docker.sock').gid
  } catch {
    socketGid = null
  }

  const dockerArgs = [
    'docker',
    'run',
    '--rm',
    '--interactive',
    '--tty',
    '--user',
    '0:0',
    ...(socketGid !== null ? ['--group-add', String(socketGid)] : []),
    '--name',
    `hermes-terminal-${params.sessionId.slice(0, 12)}`,
    '--volume',
    '/:/host:rw,rslave',
    '--volume',
    '/var/run/docker.sock:/var/run/docker.sock',
    '--workdir',
    mountedCwd,
    '--env',
    'TERM=xterm-256color',
    '--env',
    'COLORTERM=truecolor',
    '--env',
    `COLUMNS=${String(params.cols)}`,
    '--env',
    `LINES=${String(params.rows)}`,
    '--env',
    'DOCKER_HOST=unix:///var/run/docker.sock',
    image,
    '/bin/sh',
    '-lc',
    shellJoin(hostCommand),
  ]

  return ['/bin/sh', '-lc', shellJoin(dockerArgs)]
}

export function createTerminalSession(params: {
  command?: Array<string>
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}): TerminalSession {
  const emitter = new EventEmitter()
  const sessionId = randomUUID()

  const home = process.env.HOME || homedir() || '/tmp'
  const defaultShell =
    process.platform === 'win32'
      ? 'powershell.exe'
      : process.platform === 'darwin'
        ? '/bin/zsh'
        : '/bin/bash'
  const baseCommand = params.command?.length
    ? params.command
    : [process.env.SHELL ?? defaultShell]
  const hostTerminalMode =
    process.platform !== 'win32' && isTruthy(process.env.HERMES_TERMINAL_HOST_MODE)
  const command = hostTerminalMode
    ? buildHostTerminalCommand({
        sessionId,
        command: baseCommand,
        cols: params.cols ?? 80,
        rows: params.rows ?? 24,
        image: process.env.HERMES_TERMINAL_HOST_IMAGE,
        home: process.env.HERMES_TERMINAL_HOST_HOME,
        user: process.env.HERMES_TERMINAL_HOST_USER,
        cwd: process.env.HERMES_TERMINAL_HOST_CWD,
        path: process.env.HERMES_TERMINAL_HOST_PATH,
      })
    : baseCommand
  let cwd = params.cwd ?? home
  if (cwd.startsWith('~')) {
    cwd = cwd.replace('~', home)
  }
  if (!existsSync(cwd)) {
    cwd = home
  }

  const cols = params.cols ?? 80
  const rows = params.rows ?? 24

  // Buffer early output before any listener registers
  const earlyBuffer: Array<TerminalSessionEvent> = []
  let hasListeners = false

  emitter.on('newListener', (eventName) => {
    if (eventName === 'event' && !hasListeners) {
      hasListeners = true
      process.nextTick(() => {
        for (const evt of earlyBuffer) {
          emitter.emit('event', evt)
        }
        earlyBuffer.length = 0
      })
    }
  })

  const pushEvent = (evt: TerminalSessionEvent) => {
    if (hasListeners) {
      emitter.emit('event', evt)
    } else {
      earlyBuffer.push(evt)
    }
  }

  // Spawn shell directly on Windows, else use Python PTY helper for POSIX
  let proc: ChildProcess
  if (process.platform === 'win32') {
    proc = spawn(command[0], command.slice(1), {
      cwd,
      env: {
        ...process.env,
        ...params.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        COLUMNS: String(cols),
        LINES: String(rows),
      } as Record<string, string>,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } else {
    proc = spawn(
      'python3',
      [PTY_HELPER, cwd, String(cols), String(rows), '--', ...command],
      {
        env: {
          ...process.env,
          ...params.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          COLUMNS: String(cols),
          LINES: String(rows),
        } as Record<string, string>,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
  }

  proc.stdout?.on('data', (data: Buffer) => {
    pushEvent({
      event: 'data',
      payload: { data: data.toString() },
    })
  })

  // stderr from the helper itself (not the shell)
  proc.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    if (msg.trim()) {
      if (import.meta.env.DEV) console.error('[pty-helper stderr]', msg)
    }
  })

  proc.on('exit', (exitCode, signal) => {
    pushEvent({
      event: 'exit',
      payload: { exitCode, signal: signal ?? undefined },
    })
    emitter.emit('close')
    sessions.delete(sessionId)
  })

  proc.on('error', (err) => {
    pushEvent({
      event: 'error',
      payload: { message: err.message },
    })
  })

  let detachTimer: ReturnType<typeof setTimeout> | null = null

  const session: TerminalSession = {
    id: sessionId,
    createdAt: Date.now(),
    emitter,

    sendInput(data: string) {
      if (proc.stdin?.writable) {
        proc.stdin.write(data)
      }
    },

    resize(_newCols: number, _newRows: number) {
      // Send SIGWINCH to the Python helper, which propagates to the PTY
      if (proc.pid) {
        // Note: can't update env on running ChildProcess, SIGWINCH alone is sent
        try {
          process.kill(proc.pid, 'SIGWINCH')
        } catch {
          /* */
        }
      }
    },

    markDetached() {
      if (detachTimer) clearTimeout(detachTimer)
      detachTimer = setTimeout(() => {
        detachTimer = null
        // Only reap if the session is still in the map and the proc is alive.
        if (sessions.get(sessionId) === session) {
          session.close()
        }
      }, DETACH_TTL_MS)
    },

    markAttached() {
      if (detachTimer) {
        clearTimeout(detachTimer)
        detachTimer = null
      }
    },

    close() {
      if (detachTimer) {
        clearTimeout(detachTimer)
        detachTimer = null
      }
      try {
        proc.kill('SIGTERM')
        setTimeout(() => {
          try {
            proc.kill('SIGKILL')
          } catch {
            /* */
          }
        }, 2000)
      } catch {
        /* */
      }
      sessions.delete(sessionId)
    },
  }

  sessions.set(sessionId, session)
  return session
}

export function getTerminalSession(id: string): TerminalSession | null {
  return sessions.get(id) ?? null
}

export function closeTerminalSession(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  session.close()
}
