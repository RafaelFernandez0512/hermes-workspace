import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSessionMessages } from './claude-dashboard-api'
import { getHermesRoot } from './claude-paths'
import { getLocalMessages } from './local-session-store'
import type { DashboardMessage } from './claude-dashboard-api'
import type { LocalMessage } from './local-session-store'

export type TaskLatestRun = {
  summary?: string | null
  outcome?: string | null
  status?: string | null
  error?: string | null
  metadata?: Record<string, unknown> | null
  profile?: string | null
  startedAt?: number | null
  endedAt?: number | null
  activities: Array<string>
}

type LatestRunSource = {
  summary?: string | null
  outcome?: string | null
  status?: string | null
  error?: string | null
  metadata?: Record<string, unknown> | null
  profile?: string | null
  startedAt?: number | null
  endedAt?: number | null
}

type MessageSource = Pick<DashboardMessage, 'role' | 'content' | 'timestamp'> | Pick<LocalMessage, 'role' | 'content' | 'timestamp'>

function humanizeKey(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function truncate(value: string, maxLength = 240): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function normalizeValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeValue(item))
      .filter(Boolean)
      .join(', ')
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function metadataActivities(metadata: Record<string, unknown> | null | undefined): Array<string> {
  if (!metadata) return []
  const activities: Array<string> = []
  const seen = new Set<string>()
  const prioritizedKeys = ['changed_files', 'commands_run', 'validation', 'decision', 'key_risks', 'worker_session_id'] as const

  function append(key: string, value: unknown): void {
    const normalized = normalizeValue(value).trim()
    if (!normalized) return
    const label = humanizeKey(key)
    const entry = `${label}: ${truncate(normalized)}`
    if (seen.has(entry)) return
    seen.add(entry)
    activities.push(entry)
  }

  for (const key of prioritizedKeys) {
    if (key in metadata) append(key, metadata[key])
  }

  for (const [key, value] of Object.entries(metadata)) {
    if (prioritizedKeys.includes(key)) continue
    append(key, value)
  }

  return activities
}

function messageActivities(messages: Array<MessageSource>): Array<string> {
  return messages
    .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
    .slice(-8)
    .map((message) => `${humanizeKey(message.role || 'message')}: ${truncate(message.content?.trim() ?? '')}`)
}

function lastAssistantMessage(messages: Array<MessageSource>): string | null {
  const assistant = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && typeof message.content === 'string' && message.content.trim().length > 0)
  const content = assistant?.content?.trim() ?? ''
  return content ? content : null
}

function lastTimestamp(messages: Array<MessageSource>): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const timestamp = messages[index]?.timestamp
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp
  }
  return null
}

function normalizeLogLine(value: string): string {
  return value.replace(/^\s*┊\s*/, '').replace(/\s+/g, ' ').trim()
}

function extractSummaryFromKanbanLog(lines: Array<string>): string | null {
  const start = lines.findIndex((line) => line.includes('╭─ ⚕ Hermes'))
  if (start === -1) return null

  const collected: Array<string> = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue
    if (line.startsWith('╰')) break
    if (line.startsWith('╭')) continue
    collected.push(line)
  }

  if (collected.length === 0) return null
  return collected.join(' ').replace(/\s+/g, ' ').trim()
}

function extractActivitiesFromKanbanLog(lines: Array<string>): Array<string> {
  const activities: Array<string> = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (!line.trimStart().startsWith('┊')) continue
    const activity = normalizeLogLine(line)
    if (!activity || seen.has(activity)) continue
    seen.add(activity)
    activities.push(activity)
  }

  return activities.slice(-8)
}

export function buildTaskRunRecapFromKanbanLog(logText: string): TaskLatestRun | null {
  const lines = logText.split(/\r?\n/)
  const summary = extractSummaryFromKanbanLog(lines)
  const activities = extractActivitiesFromKanbanLog(lines)
  if (!summary && activities.length === 0) return null
  return {
    summary,
    outcome: summary ? 'completed' : null,
    status: summary ? 'done' : null,
    error: null,
    metadata: null,
    profile: null,
    startedAt: null,
    endedAt: null,
    activities,
  }
}

function buildTaskRunRecapFromKanbanTask(taskId: string): TaskLatestRun | null {
  const logPath = join(getHermesRoot(), 'kanban', 'logs', `${taskId}.log`)
  if (!existsSync(logPath)) return null
  try {
    const logText = readFileSync(logPath, 'utf8')
    return buildTaskRunRecapFromKanbanLog(logText)
  } catch {
    return null
  }
}

export function buildTaskRunRecapFromLatestRun(run: LatestRunSource | null | undefined): TaskLatestRun | null {
  if (!run) return null
  const activities = metadataActivities(run.metadata)
  if (!run.summary && !run.outcome && !run.status && !run.error && activities.length === 0) return null
  return {
    summary: run.summary ?? null,
    outcome: run.outcome ?? null,
    status: run.status ?? null,
    error: run.error ?? null,
    metadata: run.metadata ?? null,
    profile: run.profile ?? null,
    startedAt: run.startedAt ?? null,
    endedAt: run.endedAt ?? null,
    activities,
  }
}

export function buildTaskRunRecapFromMessages(
  messages: Array<MessageSource>,
  opts: { sessionStarted?: number | null; model?: string | null } = {},
): TaskLatestRun | null {
  const activities = messageActivities(messages)
  const summary = lastAssistantMessage(messages)
  if (!summary && activities.length === 0) return null
  return {
    summary,
    outcome: summary ? 'completed' : null,
    status: summary ? 'done' : null,
    error: null,
    metadata: null,
    profile: opts.model ?? null,
    startedAt: typeof opts.sessionStarted === 'number' ? opts.sessionStarted : null,
    endedAt: lastTimestamp(messages),
    activities,
  }
}

export async function buildTaskRunRecapForSession(
  sessionId: string | null | undefined,
  taskId?: string | null,
): Promise<TaskLatestRun | null> {
  if (sessionId) {
    try {
      const dashboard = await getSessionMessages(sessionId)
      const messages = Array.isArray(dashboard.messages) ? dashboard.messages : []
      const recap = buildTaskRunRecapFromMessages(messages, {
        sessionStarted: typeof dashboard.session_started === 'number' ? dashboard.session_started : null,
        model: typeof dashboard.model === 'string' ? dashboard.model : null,
      })
      if (recap) return recap
    } catch {
      // Dashboard unavailable — fall back to local session cache.
    }

    const localMessages = getLocalMessages(sessionId)
    const localRecap = buildTaskRunRecapFromMessages(localMessages)
    if (localRecap) return localRecap
  }

  if (taskId) {
    const kanbanRecap = buildTaskRunRecapFromKanbanTask(taskId)
    if (kanbanRecap) return kanbanRecap
  }

  return null
}
