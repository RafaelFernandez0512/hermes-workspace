import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const HERMES_HOME =
  process.env.HERMES_HOME ??
  process.env.CLAUDE_HOME ??
  path.join(os.homedir(), '.hermes')

export type AuditEntry = {
  kind: 'mission' | 'task' | 'kanban-card' | 'profile' | 'admin'
  target: string
  action:
    | 'cancel'
    | 'archive'
    | 'unarchive'
    | 'delete'
    | 'approve'
    | 'reject'
    | 'cleanup'
  actor: string
  reason?: string
  ts: string
  meta?: Record<string, unknown>
}

export function appendAuditEntry(entry: AuditEntry): void {
  try {
    const auditDir = path.join(HERMES_HOME, 'audit')
    fs.mkdirSync(auditDir, { recursive: true })

    const now = entry.ts ? new Date(entry.ts) : new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const auditFile = path.join(auditDir, `lifecycle-${month}.jsonl`)

    const line = JSON.stringify({
      ts: entry.ts ?? now.toISOString(),
      kind: entry.kind,
      target: entry.target,
      action: entry.action,
      actor: entry.actor,
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.meta ? { meta: entry.meta } : {}),
    })

    fs.appendFileSync(auditFile, line + '\n', 'utf-8')
  } catch {
    // Audit log failures must never crash the primary operation
  }
}
