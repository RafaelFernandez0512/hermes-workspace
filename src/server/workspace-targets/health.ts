import type { WorkspaceTarget } from './types'
import { loadTargetsFile } from './store'

const PROBE_TIMEOUT_MS = 3_000

type ProbeResult =
  | { ok: true; latencyMs: number }
  | { ok: false; error: string }
  | { skipped: true }

type TargetHealthResult = {
  hermes: ProbeResult
  dashboard: ProbeResult
  ssh: ProbeResult
  sftp: ProbeResult
}

async function probeHttp(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  const start = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    const ok = res.ok || res.status < 500
    return ok
      ? { ok: true, latencyMs: Date.now() - start }
      : { ok: false, error: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function probeSsh(
  config: NonNullable<NonNullable<WorkspaceTarget['terminal']>['ssh']>,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  try {
    const { Client } = await import('ssh2')
    const { readFileSync } = await import('node:fs')
    return await new Promise<ProbeResult>((resolve) => {
      const client = new Client()
      const timer = setTimeout(() => {
        client.destroy()
        resolve({ ok: false, error: 'Connection timed out' })
      }, timeoutMs)

      client.on('ready', () => {
        clearTimeout(timer)
        client.end()
        resolve({ ok: true, latencyMs: 0 })
      })
      client.on('error', (err) => {
        clearTimeout(timer)
        resolve({ ok: false, error: err.message })
      })

      const connectOptions: Parameters<typeof client.connect>[0] = {
        host: config.host,
        port: config.port ?? 22,
        username: config.user,
        readyTimeout: timeoutMs,
      }
      if (config.keyPath) {
        connectOptions.privateKey = readFileSync(config.keyPath)
        if (config.passphraseRef) connectOptions.passphrase = config.passphraseRef
      }

      client.connect(connectOptions)
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function probeSftp(
  config: NonNullable<NonNullable<WorkspaceTarget['files']>['sftp']>,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  try {
    const { Client } = await import('ssh2')
    const { readFileSync } = await import('node:fs')
    return await new Promise<ProbeResult>((resolve) => {
      const client = new Client()
      const timer = setTimeout(() => {
        client.destroy()
        resolve({ ok: false, error: 'Connection timed out' })
      }, timeoutMs)

      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            clearTimeout(timer)
            client.end()
            resolve({ ok: false, error: err.message })
            return
          }
          sftp.realpath(config.rootPath, (err2, resolvedPath) => {
            clearTimeout(timer)
            client.end()
            if (err2) {
              resolve({ ok: false, error: `rootPath not accessible: ${err2.message}` })
            } else {
              void resolvedPath
              resolve({ ok: true, latencyMs: 0 })
            }
          })
        })
      })
      client.on('error', (err) => {
        clearTimeout(timer)
        resolve({ ok: false, error: err.message })
      })

      const connectOptions: Parameters<typeof client.connect>[0] = {
        host: config.host,
        port: config.port ?? 22,
        username: config.user,
        readyTimeout: timeoutMs,
      }
      if (config.keyPath) {
        connectOptions.privateKey = readFileSync(config.keyPath)
        if (config.passphraseRef) connectOptions.passphrase = config.passphraseRef
      }

      client.connect(connectOptions)
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function testTarget(id: string): Promise<TargetHealthResult> {
  const file = await loadTargetsFile()
  const target = file.targets.find((t) => t.id === id)
  if (!target) throw Object.assign(new Error(`Target "${id}" not found`), { status: 404 })

  const [hermes, dashboard, ssh, sftp] = await Promise.all([
    target.hermes?.gatewayUrl
      ? probeHttp(`${target.hermes.gatewayUrl}/health`)
      : Promise.resolve<ProbeResult>({ skipped: true }),
    target.hermes?.dashboardUrl
      ? probeHttp(`${target.hermes.dashboardUrl}/`)
      : Promise.resolve<ProbeResult>({ skipped: true }),
    target.terminal?.mode === 'ssh' && target.terminal.ssh
      ? probeSsh(target.terminal.ssh)
      : Promise.resolve<ProbeResult>({ skipped: true }),
    target.files?.mode === 'sftp' && target.files.sftp
      ? probeSftp(target.files.sftp)
      : Promise.resolve<ProbeResult>({ skipped: true }),
  ])

  return { hermes, dashboard, ssh, sftp }
}
