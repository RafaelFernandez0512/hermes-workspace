#!/usr/bin/env tsx
/**
 * restore.ts
 *
 * Restores Hermes runtime data from a backup created by backup.ts.
 *
 * Usage:
 *  pnpm tsx scripts/restore.ts --timestamp 2026-06-06T10-30-00
 *  pnpm tsx scripts/restore.ts --file /path/to/swarm-missions_2026-06-06T10-30-00.json
 *  pnpm tsx scripts/restore.ts --list
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
const tsIdx = args.indexOf('--timestamp')
const fileIdx = args.indexOf('--file')
const LIST_MODE = args.includes('--list')
const DRY_RUN = args.includes('--dry-run')

function log(msg: string) {
  console.log(`[restore] ${msg}`)
}

function listBackups(dir: string) {
  if (!fs.existsSync(dir)) {
    log('No backup directory found')
    return
  }
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  if (!entries.length) {
    log('No backups found')
    return
  }
  log(`Available backups in ${dir}:`)
  for (const entry of entries.sort().reverse()) {
    log(`  ${entry}`)
  }
}

function restoreFile(src: string, dest: string) {
  if (!fs.existsSync(src)) {
    log(`  SKIP (not found): ${src}`)
    return
  }
  if (!DRY_RUN) {
    const safetyBackup = `${dest}.pre-restore.${Date.now()}.bak`
    if (fs.existsSync(dest)) {
      fs.copyFileSync(dest, safetyBackup)
      log(`  Safety backup: ${safetyBackup}`)
    }
    fs.copyFileSync(src, dest)
    log(`  Restored: ${dest}`)
  } else {
    log(`  DRY-RUN would restore: ${src} → ${dest}`)
  }
}

if (LIST_MODE) {
  listBackups(DEFAULT_BACKUP_DIR)
} else if (tsIdx !== -1 && args[tsIdx + 1]) {
  const ts = args[tsIdx + 1]
  log(`Restoring from timestamp: ${ts}`)
  restoreFile(
    path.join(DEFAULT_BACKUP_DIR, `swarm-missions_${ts}.json`),
    path.join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-missions.json'),
  )
  restoreFile(
    path.join(DEFAULT_BACKUP_DIR, `swarm2-kanban_${ts}.json`),
    path.join(HERMES_HOME, 'swarm2-kanban.json'),
  )
  restoreFile(
    path.join(DEFAULT_BACKUP_DIR, `tasks_${ts}.json`),
    path.join(HERMES_HOME, 'tasks.json'),
  )
  log(DRY_RUN ? 'DRY-RUN complete — no files changed' : 'Restore complete')
} else if (fileIdx !== -1 && args[fileIdx + 1]) {
  const src = args[fileIdx + 1]
  const basename = path.basename(src)
  let dest: string | null = null
  if (basename.startsWith('swarm-missions')) {
    dest = path.join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-missions.json')
  } else if (basename.startsWith('swarm2-kanban')) {
    dest = path.join(HERMES_HOME, 'swarm2-kanban.json')
  } else if (basename.startsWith('tasks')) {
    dest = path.join(HERMES_HOME, 'tasks.json')
  }
  if (!dest) {
    console.error(
      'Cannot determine destination from filename. Use a backup created by backup.ts.',
    )
    process.exit(1)
  }
  restoreFile(src, dest)
  log(DRY_RUN ? 'DRY-RUN complete — no files changed' : 'Restore complete')
} else {
  console.error('Usage:')
  console.error('  pnpm tsx scripts/restore.ts --list')
  console.error('  pnpm tsx scripts/restore.ts --timestamp <ts>  [--dry-run]')
  console.error('  pnpm tsx scripts/restore.ts --file <path>     [--dry-run]')
  process.exit(1)
}
