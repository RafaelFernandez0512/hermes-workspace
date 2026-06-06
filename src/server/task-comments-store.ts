import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type TaskCommentAction = 'approve' | 'approve_and_requeue' | 'request_changes' | 'retry' | 'reject' | 'system' | null

export type TaskComment = {
  id: string
  task_id: string
  author: string
  body: string
  created_at: string
  action: TaskCommentAction
}

type CommentsFile = { comments: TaskComment[] }

const CLAUDE_HOME = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes')
const COMMENTS_FILE = path.join(CLAUDE_HOME, 'task-comments.json')

function ensureFile(): void {
  fs.mkdirSync(CLAUDE_HOME, { recursive: true })
  if (!fs.existsSync(COMMENTS_FILE)) {
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify({ comments: [] }, null, 2) + '\n', 'utf-8')
  }
}

function readFile(): CommentsFile {
  ensureFile()
  try {
    const raw = fs.readFileSync(COMMENTS_FILE, 'utf-8').trim()
    if (!raw) return { comments: [] }
    const parsed = JSON.parse(raw) as Partial<CommentsFile>
    return { comments: Array.isArray(parsed.comments) ? parsed.comments : [] }
  } catch {
    return { comments: [] }
  }
}

function writeFile(data: CommentsFile): void {
  ensureFile()
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export function getTaskComments(taskId: string): TaskComment[] {
  return readFile().comments
    .filter(c => c.task_id === taskId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export function addTaskComment(input: {
  task_id: string
  author?: string
  body: string
  action?: TaskCommentAction
}): TaskComment {
  const file = readFile()
  const comment: TaskComment = {
    id: randomUUID(),
    task_id: input.task_id,
    author: input.author ?? 'user',
    body: input.body,
    created_at: new Date().toISOString(),
    action: input.action ?? null,
  }
  file.comments.push(comment)
  writeFile(file)
  return comment
}
