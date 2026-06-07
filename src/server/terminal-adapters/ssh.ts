import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import EventEmitter from 'node:events'
import type { TerminalAdapter, TerminalSession, TerminalSshConfig } from '../workspace-targets/types'

const DETACH_TTL_MS = (() => {
  const raw = process.env.HERMES_TERMINAL_DETACH_TTL_MS
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 5 * 60_000
})()

export class SshTerminalAdapter implements TerminalAdapter {
  readonly kind = 'ssh' as const

  constructor(private readonly config: TerminalSshConfig) {}

  async open(opts: {
    sessionId: string
    cols: number
    rows: number
    cwd?: string
    command?: Array<string>
  }): Promise<TerminalSession> {
    const { Client } = await import('ssh2')
    const emitter = new EventEmitter()
    const sessionId = opts.sessionId || randomUUID()

    const connectOptions: Parameters<InstanceType<typeof Client>['connect']>[0] = {
      host: this.config.host,
      port: this.config.port ?? 22,
      username: this.config.user,
      readyTimeout: 10_000,
    }
    if (this.config.keyPath) {
      connectOptions.privateKey = readFileSync(this.config.keyPath)
      if (this.config.passphraseRef) connectOptions.passphrase = this.config.passphraseRef
    }
    if (this.config.knownHostsPath) {
      // ssh2 doesn't use known_hosts directly; host verification is handled separately
    }

    const client = new Client()
    let shell: import('ssh2').ClientChannel | null = null
    let detachTimer: ReturnType<typeof setTimeout> | null = null

    const earlyBuffer: Array<{ event: string; payload: unknown }> = []
    let hasListeners = false
    emitter.on('newListener', (eventName) => {
      if (eventName === 'event' && !hasListeners) {
        hasListeners = true
        process.nextTick(() => {
          for (const evt of earlyBuffer) emitter.emit('event', evt)
          earlyBuffer.length = 0
        })
      }
    })
    const pushEvent = (evt: { event: string; payload: unknown }) => {
      if (hasListeners) {
        emitter.emit('event', evt)
      } else {
        earlyBuffer.push(evt)
      }
    }

    await new Promise<void>((resolve, reject) => {
      client.on('ready', () => {
        const shellOpts = {
          term: 'xterm-256color',
          cols: opts.cols,
          rows: opts.rows,
        }
        client.shell(shellOpts, (err, ch) => {
          if (err) {
            client.end()
            reject(err)
            return
          }
          shell = ch
          if (opts.cwd) {
            ch.write(`cd ${JSON.stringify(opts.cwd)}\n`)
          }
          if (opts.command?.length) {
            ch.write(opts.command.join(' ') + '\n')
          }
          ch.on('data', (data: Buffer) => {
            pushEvent({ event: 'data', payload: { data: data.toString() } })
          })
          ch.on('close', () => {
            pushEvent({ event: 'exit', payload: { exitCode: 0 } })
            emitter.emit('close')
            client.end()
          })
          ch.stderr.on('data', (data: Buffer) => {
            pushEvent({ event: 'data', payload: { data: data.toString() } })
          })
          resolve()
        })
      })
      client.on('error', reject)
      client.connect(connectOptions)
    })

    const session: TerminalSession = {
      id: sessionId,
      createdAt: Date.now(),
      emitter,
      targetId: this.config.host,

      sendInput(data: string) {
        shell?.write(data)
      },

      resize(cols: number, rows: number) {
        shell?.setWindow(rows, cols, 0, 0)
      },

      markDetached() {
        if (detachTimer) clearTimeout(detachTimer)
        detachTimer = setTimeout(() => {
          detachTimer = null
          session.close()
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
        shell?.close()
        client.end()
      },
    }

    return session
  }
}
