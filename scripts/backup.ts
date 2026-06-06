#!/usr/bin/env tsx
/**
 * backup.ts
 *
 * Creates a timestamped backup of Hermes runtime data files:
 *  - swarm-missions.json
 *  - swarm2-kanban.json
 *  - tasks.json
 *
 * Usage:
 *  pnpm tsx scripts/backup.ts [--dest <dir>]
 *  pnpm tsx scripts/backup.ts --list       # list existing backups
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERMES_HOME =
  process.env.HERMES_HOME ??
  process.env.CLAUDE_HOME ??
  path.join(os.homedir(), '.hermes')

const SWARM_CANONICAL_REPO = process.env.SWARM_CANONICAL_REPO ?? HERMES_HOME

const DEFAULT_BACKUP_DIR = path.join(HERMES_HOME, 'backups')

const args = process.argv.slice(2)
const destIdx = args.indexOf('--dest')
const BACKUP_DIR =
  destIdx !== -1 && args[destIdx + 1] ? args[destIdx + 1] : DEFAULT_BACKUP_DIR
const LIST_MODE = args.includes('--list')

function log(msg: string) {
  console.log(`[backup] ${msg}`)
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    log('No backups found (backup directory does not exist)')
    return
  }
  const entries = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json'))
  if (entries.length === 0) {
    log('No backups found')
    return
  }
  log(`Backups in ${BACKUP_DIR}:`)
  for (const entry of entries.sort().reverse()) {
    const stat = fs.statSync(path.join(BACKUP_DIR, entry))
    log(`  ${entry}  (${Math.round(stat.size / 1024)}KB)`)
  }
}

function backup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  const files: Array<{ src: string; name: string }> = [
    {
      src: path.join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-missions.json'),
      name: `swarm-missions_${ts}.json`,
    },
    {
      src: path.join(HERMES_HOME, 'swarm2-kanban.json'),
      name: `swarm2-kanban_${ts}.json`,
    },
    {
      src: path.join(HERMES_HOME, 'tasks.json'),
      name: `tasks_${ts}.json`,
    },
  ]

  let backed = 0
  for (const { src, name } of files) {
    if (!fs.existsSync(src)) {
      log(`  SKIP (not found): ${src}`)
      continue
    }
    const dest = path.join(BACKUP_DIR, name)
    fs.copyFileSync(src, dest)
    const stat = fs.statSync(dest)
    log(`  OK: ${name}  (${Math.round(stat.size / 1024)}KB)`)
    backed++
  }
  log(`Backup complete — ${backed} files written to ${BACKUP_DIR}`)
}

if (LIST_MODE) {
  listBackups()
} else {
  log(`Creating backup at ${BACKUP_DIR}`)
  backup()
}
