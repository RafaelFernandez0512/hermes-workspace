#!/usr/bin/env tsx
/**
 * migrate-lifecycle.ts
 *
 * Idempotent migration: adds lifecycle audit fields to existing
 * swarm-missions.json and swarm2-kanban.json records.
 *
 * Fields added:
 *  SwarmMission: archivedAt, archivedBy, archiveReason, cancelledAt, cancelledBy,
 *                cancelReason, deletedAt, deletedBy, deleteReason, isDeleted
 *  SwarmKanbanCard: archivedAt, archivedBy, archiveReason, cancelledAt, cancelledBy,
 *                   cancelReason, deletedAt, deletedBy, deleteReason, isDeleted
 *
 * Usage:
 *  pnpm tsx scripts/migrate-lifecycle.ts [--dry-run]
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERMES_HOME =
  process.env.HERMES_HOME ??
  process.env.CLAUDE_HOME ??
  path.join(os.homedir(), '.hermes')

const SWARM_CANONICAL_REPO =
  process.env.SWARM_CANONICAL_REPO ?? path.join(os.homedir(), '.hermes')

const MISSIONS_PATH = path.join(
  SWARM_CANONICAL_REPO,
  '.runtime',
  'swarm-missions.json',
)
const KANBAN_PATH = path.join(HERMES_HOME, 'swarm2-kanban.json')

const DRY_RUN = process.argv.includes('--dry-run')

function log(msg: string) {
  console.log(`[migrate-lifecycle] ${msg}`)
}

function addMissingFields<T extends Record<string, unknown>>(
  record: T,
  defaults: Record<string, unknown>,
): { record: T; changed: boolean } {
  let changed = false
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in record)) {
      ;(record as Record<string, unknown>)[key] = value
      changed = true
    }
  }
  return { record, changed }
}

const MISSION_AUDIT_DEFAULTS: Record<string, unknown> = {
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  deletedAt: null,
  deletedBy: null,
  deleteReason: null,
  isDeleted: false,
}

const CARD_AUDIT_DEFAULTS: Record<string, unknown> = {
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  deletedAt: null,
  deletedBy: null,
  deleteReason: null,
  isDeleted: false,
}

function migrateMissions(): { updated: number; skipped: number } {
  if (!fs.existsSync(MISSIONS_PATH)) {
    log(`Missions file not found: ${MISSIONS_PATH} — skipping`)
    return { updated: 0, skipped: 0 }
  }
  const raw = fs.readFileSync(MISSIONS_PATH, 'utf-8')
  const data = JSON.parse(raw) as {
    version: number
    missions: Array<Record<string, unknown>>
  }
  if (!Array.isArray(data.missions)) {
    log('Missions file has no missions array — skipping')
    return { updated: 0, skipped: 0 }
  }
  let updated = 0
  let skipped = 0
  for (const mission of data.missions) {
    const { changed } = addMissingFields(mission, MISSION_AUDIT_DEFAULTS)
    if (changed) updated++
    else skipped++
  }
  if (!DRY_RUN && updated > 0) {
    const tmp = `${MISSIONS_PATH}.migrate.${Date.now()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
    fs.renameSync(tmp, MISSIONS_PATH)
  }
  return { updated, skipped }
}

function migrateKanban(): { updated: number; skipped: number } {
  if (!fs.existsSync(KANBAN_PATH)) {
    log(`Kanban file not found: ${KANBAN_PATH} — skipping`)
    return { updated: 0, skipped: 0 }
  }
  const raw = fs.readFileSync(KANBAN_PATH, 'utf-8')
  const data = JSON.parse(raw) as { cards: Array<Record<string, unknown>> }
  if (!Array.isArray(data.cards)) {
    log('Kanban file has no cards array — skipping')
    return { updated: 0, skipped: 0 }
  }
  let updated = 0
  let skipped = 0
  for (const card of data.cards) {
    const { changed } = addMissingFields(card, CARD_AUDIT_DEFAULTS)
    if (changed) updated++
    else skipped++
  }
  if (!DRY_RUN && updated > 0) {
    const tmp = `${KANBAN_PATH}.migrate.${Date.now()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
    fs.renameSync(tmp, KANBAN_PATH)
  }
  return { updated, skipped }
}

log(`Running in ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} mode`)
log(`HERMES_HOME: ${HERMES_HOME}`)

const missionResult = migrateMissions()
log(
  `Missions: ${missionResult.updated} updated, ${missionResult.skipped} already up-to-date`,
)

const kanbanResult = migrateKanban()
log(
  `KanbanCards: ${kanbanResult.updated} updated, ${kanbanResult.skipped} already up-to-date`,
)

const totalUpdated = missionResult.updated + kanbanResult.updated
if (DRY_RUN) {
  log(
    `DRY-RUN complete — ${totalUpdated} records would be updated (no files written)`,
  )
} else {
  log(`Migration complete — ${totalUpdated} records updated`)
}
