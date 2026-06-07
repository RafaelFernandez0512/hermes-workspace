import type { WorkspaceTarget } from '../server/workspace-targets/types'

export type { WorkspaceTarget }

export async function listTargets(): Promise<{
  targets: WorkspaceTarget[]
  activeTargetId?: string
}> {
  const res = await fetch('/api/workspace-targets/list')
  if (!res.ok) throw new Error(`Failed to list targets: ${res.status}`)
  const data = (await res.json()) as { targets: WorkspaceTarget[]; activeTargetId?: string }
  return { targets: data.targets, activeTargetId: data.activeTargetId }
}

export async function upsertTarget(target: WorkspaceTarget): Promise<WorkspaceTarget> {
  const res = await fetch('/api/workspace-targets/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(target),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Failed to upsert target: ${res.status}`)
  }
  const data = (await res.json()) as { target: WorkspaceTarget }
  return data.target
}

export async function deleteTarget(id: string): Promise<void> {
  const res = await fetch(`/api/workspace-targets/delete?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to delete target: ${res.status}`)
}

export async function getActiveTargetId(): Promise<string | undefined> {
  const res = await fetch('/api/workspace-targets/active')
  if (!res.ok) throw new Error(`Failed to get active target: ${res.status}`)
  const data = (await res.json()) as { activeTargetId?: string }
  return data.activeTargetId
}

export async function setActiveTargetId(id: string | undefined): Promise<void> {
  const res = await fetch('/api/workspace-targets/active', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id ?? null }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Failed to set active target: ${res.status}`)
  }
}

export type TargetTestResult = {
  hermes: { ok?: boolean; latencyMs?: number; error?: string; skipped?: boolean }
  dashboard: { ok?: boolean; latencyMs?: number; error?: string; skipped?: boolean }
  ssh: { ok?: boolean; latencyMs?: number; error?: string; skipped?: boolean }
  sftp: { ok?: boolean; latencyMs?: number; error?: string; skipped?: boolean }
}

export async function testTarget(id: string): Promise<TargetTestResult> {
  const res = await fetch('/api/workspace-targets/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Test failed: ${res.status}`)
  }
  return res.json() as Promise<TargetTestResult>
}
