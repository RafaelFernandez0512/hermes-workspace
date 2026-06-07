import { CLAUDE_API, CLAUDE_DASHBOARD_URL, getActiveGatewayUrl, getActiveDashboardUrl } from '../gateway-capabilities'
import { loadTargetsFile, getTargetsCacheSync, warmTargetsCache } from './store'
import { activeTargetAls, getActiveTargetIdFromAls } from './context'
import type { HermesApiTarget, TerminalAdapter, FilesAdapter } from './types'

export { activeTargetAls, getActiveGatewayUrl, getActiveDashboardUrl }

export function getActiveTargetId(): string | undefined {
  return getActiveTargetIdFromAls()
}

export async function withActiveTarget<T>(
  targetId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return activeTargetAls.run({ targetId }, fn)
}

/** Whether the active target has an explicit Hermes gateway configured. */
export function hasProfileHermesApi(): boolean {
  const id = getActiveTargetIdFromAls()
  if (!id) return false
  const cache = getTargetsCacheSync()
  if (!cache) return false
  const target = cache.targets.find((t) => t.id === id)
  return Boolean(target?.hermes?.gatewayUrl)
}

// ── Async resolvers ──────────────────────────────────────────────────────────

export async function resolveHermesApi(): Promise<HermesApiTarget> {
  const id = getActiveTargetId()
  if (!id) return _defaultHermesTarget()
  const file = await loadTargetsFile()
  const target = file.targets.find((t) => t.id === id)
  if (!target?.hermes?.gatewayUrl) return _defaultHermesTarget()
  return {
    gatewayUrl: target.hermes.gatewayUrl,
    dashboardUrl: target.hermes.dashboardUrl ?? CLAUDE_DASHBOARD_URL,
    apiTokenRef: target.hermes.apiTokenRef,
    source: 'profile',
    profileId: target.id,
  }
}

export async function resolveTerminalAdapter(): Promise<TerminalAdapter> {
  const id = getActiveTargetId()
  if (!id) return _localTerminalAdapter()
  const file = await loadTargetsFile()
  const target = file.targets.find((t) => t.id === id)
  if (target?.terminal?.mode === 'ssh' && target.terminal.ssh) {
    const { SshTerminalAdapter } = await import('../terminal-adapters/ssh')
    return new SshTerminalAdapter(target.terminal.ssh)
  }
  return _localTerminalAdapter()
}

export async function resolveFilesAdapter(): Promise<FilesAdapter> {
  const id = getActiveTargetId()
  if (!id) return _localFilesAdapter()
  const file = await loadTargetsFile()
  const target = file.targets.find((t) => t.id === id)
  if (target?.files?.mode === 'sftp' && target.files.sftp) {
    const { RemoteFilesAdapter } = await import('../files-adapters/sftp')
    return new RemoteFilesAdapter(target.files.sftp)
  }
  return _localFilesAdapter()
}

export async function getActiveTarget() {
  const id = getActiveTargetId()
  if (!id) return null
  const file = await loadTargetsFile()
  return file.targets.find((t) => t.id === id) ?? null
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _defaultHermesTarget(): HermesApiTarget {
  return {
    gatewayUrl: CLAUDE_API,
    dashboardUrl: CLAUDE_DASHBOARD_URL,
    source: 'default',
  }
}

async function _localTerminalAdapter(): Promise<TerminalAdapter> {
  const { LocalTerminalAdapter } = await import('../terminal-adapters/local')
  return new LocalTerminalAdapter()
}

async function _localFilesAdapter(): Promise<FilesAdapter> {
  const { LocalFilesAdapter } = await import('../files-adapters/local')
  return new LocalFilesAdapter()
}

// Warm the cache at module load time (non-blocking).
warmTargetsCache().catch(() => {})
