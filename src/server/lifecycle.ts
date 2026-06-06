/**
 * Lifecycle — cascade cancel / archive / delete for Swarms, Missions, and Kanban Cards.
 *
 * All operations are:
 *  - Transactional (single write per operation via atomic rename)
 *  - Idempotent (repeated calls with same intent are no-ops)
 *  - Auditable (actor, timestamp, reason written into the record)
 *
 * Rules:
 *  Cancel: stops active executions, cascades to all non-terminal children.
 *  Archive: soft-mark with archivedAt; excluded from default queries; can be reversed.
 *  Delete: only allowed on already-cancelled or archived entities; purges referential records.
 *
 * Feature flag: HERMES_LIFECYCLE_V2 must be enabled for cascade operations.
 */

import { isLifecycleV2Enabled } from '../lib/feature-flags'
import {
  archiveSwarmMission,
  cancelSwarmMission,
  deleteSwarmMission,
  getSwarmMission,
  listArchivedMissions,
  listSwarmMissions,
  unarchiveSwarmMission,
} from './swarm-missions'
import {
  archiveSwarmKanbanCard,
  deleteSwarmKanbanCard,
  getSwarmKanbanCard,
  isArchivedCard,
  isDeletedCard,
  listSwarmKanbanCards,
  unarchiveSwarmKanbanCard,
  updateSwarmKanbanCard,
} from './swarm-kanban-store'
import { appendAuditEntry } from './audit-log'

export type LifecycleActor = string

export type CancelMissionResult = {
  missionId: string
  cancelledAssignmentIds: Array<string>
  cancelledCardIds: Array<string>
  changed: boolean
}

export type ArchiveMissionResult = {
  missionId: string
  archivedCardIds: Array<string>
  changed: boolean
}

export type DeleteMissionResult = {
  missionId: string
  deletedCardIds: Array<string>
  changed: boolean
}

export type ArchiveCardResult = {
  cardId: string
  changed: boolean
}

export type DeleteCardResult = {
  cardId: string
  changed: boolean
}

export type CleanupCounts = {
  orphanedCards: number
  archivedMissions: number
  archivedCards: number
  staleSessions: number
}

export type CleanupDryRunResult = {
  dryRun: true
  counts: CleanupCounts
  orphanedCardIds: Array<string>
  archivedMissionIds: Array<string>
  archivedCardIds: Array<string>
}

// ─── Mission lifecycle ────────────────────────────────────────────────────────

export function cancelMissionCascade(input: {
  missionId: string
  actor?: string
  reason?: string
}): CancelMissionResult {
  const result = cancelSwarmMission({
    missionId: input.missionId,
    actor: input.actor,
    reason: input.reason,
  })
  if (!result) throw new Error(`Mission ${input.missionId} not found`)

  const cancelledCardIds: Array<string> = []
  if (isLifecycleV2Enabled()) {
    const cards = listSwarmKanbanCards({
      missionId: input.missionId,
      includeArchived: true,
    })
    for (const card of cards) {
      if (isDeletedCard(card)) continue
      if (!['done', 'archived'].includes(card.status)) {
        const updated = updateSwarmKanbanCard(card.id, { status: 'blocked' })
        if (updated) cancelledCardIds.push(card.id)
      }
    }
  }

  const changed = result.changed || cancelledCardIds.length > 0
  if (changed) {
    appendAuditEntry({
      kind: 'mission',
      target: input.missionId,
      action: 'cancel',
      actor: input.actor ?? 'system',
      reason: input.reason,
      ts: new Date().toISOString(),
      meta: { cancelledCardIds },
    })
  }
  return {
    missionId: input.missionId,
    cancelledAssignmentIds: result.cancelledAssignmentIds,
    cancelledCardIds,
    changed,
  }
}

export function archiveMissionCascade(input: {
  missionId: string
  actor?: string
  reason?: string
}): ArchiveMissionResult {
  const result = archiveSwarmMission({
    missionId: input.missionId,
    actor: input.actor,
    reason: input.reason,
  })
  if (!result) throw new Error(`Mission ${input.missionId} not found`)

  const archivedCardIds: Array<string> = []
  if (isLifecycleV2Enabled()) {
    const cards = listSwarmKanbanCards({
      missionId: input.missionId,
      includeArchived: false,
    })
    for (const card of cards) {
      if (isDeletedCard(card) || isArchivedCard(card)) continue
      const updated = archiveSwarmKanbanCard(card.id, {
        actor: input.actor,
        reason: input.reason ?? `Archived with mission ${input.missionId}`,
      })
      if (updated) archivedCardIds.push(card.id)
    }
  }

  const changed = result.changed || archivedCardIds.length > 0
  if (changed) {
    appendAuditEntry({
      kind: 'mission',
      target: input.missionId,
      action: 'archive',
      actor: input.actor ?? 'system',
      reason: input.reason,
      ts: new Date().toISOString(),
      meta: { archivedCardIds },
    })
  }
  return {
    missionId: input.missionId,
    archivedCardIds,
    changed,
  }
}

export function unarchiveMission(input: {
  missionId: string
  actor?: string
}): {
  missionId: string
  changed: boolean
} {
  const result = unarchiveSwarmMission({
    missionId: input.missionId,
    actor: input.actor,
  })
  if (!result) throw new Error(`Mission ${input.missionId} not found`)
  return { missionId: input.missionId, changed: result.changed }
}

export function deleteMissionCascade(input: {
  missionId: string
  actor?: string
  reason?: string
  force?: boolean
}): DeleteMissionResult {
  if (!input.force) {
    const mission = getSwarmMission(input.missionId)
    if (!mission) throw new Error(`Mission ${input.missionId} not found`)
    if (!['cancelled', 'archived', 'complete'].includes(mission.state)) {
      throw new Error(
        `Mission must be cancelled or archived before deletion (state: ${mission.state})`,
      )
    }
  }

  const deletedCardIds: Array<string> = []
  if (isLifecycleV2Enabled()) {
    const cards = listSwarmKanbanCards({
      missionId: input.missionId,
      includeArchived: true,
    })
    for (const card of cards) {
      if (isDeletedCard(card)) continue
      try {
        const deleted = deleteSwarmKanbanCard(card.id, {
          actor: input.actor,
          reason: input.reason ?? `Deleted with mission ${input.missionId}`,
          force: true,
        })
        if (deleted?.changed) deletedCardIds.push(card.id)
      } catch {
        // skip individual card failures during cascade
      }
    }
  }

  const result = deleteSwarmMission({
    missionId: input.missionId,
    actor: input.actor,
    reason: input.reason,
    force: input.force,
  })
  if (!result) throw new Error(`Mission ${input.missionId} not found`)

  return {
    missionId: input.missionId,
    deletedCardIds,
    changed: result.changed || deletedCardIds.length > 0,
  }
}

// ─── Kanban Card lifecycle ────────────────────────────────────────────────────

export function archiveCard(input: {
  cardId: string
  actor?: string
  reason?: string
}): ArchiveCardResult {
  const card = getSwarmKanbanCard(input.cardId)
  if (!card) throw new Error(`Card ${input.cardId} not found`)
  if (isDeletedCard(card)) throw new Error('Cannot archive a deleted card')
  if (isArchivedCard(card)) return { cardId: input.cardId, changed: false }
  const updated = archiveSwarmKanbanCard(input.cardId, {
    actor: input.actor,
    reason: input.reason,
  })
  return { cardId: input.cardId, changed: updated != null }
}

export function unarchiveCard(input: {
  cardId: string
  actor?: string
}): ArchiveCardResult {
  const card = getSwarmKanbanCard(input.cardId)
  if (!card) throw new Error(`Card ${input.cardId} not found`)
  if (!isArchivedCard(card)) return { cardId: input.cardId, changed: false }
  const updated = unarchiveSwarmKanbanCard(input.cardId, { actor: input.actor })
  return { cardId: input.cardId, changed: updated != null }
}

export function deleteCard(input: {
  cardId: string
  actor?: string
  reason?: string
  force?: boolean
}): DeleteCardResult {
  const result = deleteSwarmKanbanCard(input.cardId, {
    actor: input.actor,
    reason: input.reason,
    force: input.force,
  })
  if (!result) throw new Error(`Card ${input.cardId} not found`)
  return { cardId: input.cardId, changed: result.changed }
}

// ─── Cleanup helpers ──────────────────────────────────────────────────────────

export function dryRunCleanup(): CleanupDryRunResult {
  const missions = listSwarmMissions(1000)
  const missionIds = new Set(missions.map((m) => m.id))

  const allCards = listSwarmKanbanCards({
    includeArchived: true,
    includeDeleted: false,
  })
  const orphanedCards = allCards.filter(
    (card) => card.missionId != null && !missionIds.has(card.missionId),
  )
  const archivedCards = allCards.filter((card) => isArchivedCard(card))
  const archivedMissions = listArchivedMissions()

  return {
    dryRun: true,
    counts: {
      orphanedCards: orphanedCards.length,
      archivedMissions: archivedMissions.length,
      archivedCards: archivedCards.length,
      staleSessions: 0,
    },
    orphanedCardIds: orphanedCards.map((c) => c.id),
    archivedMissionIds: archivedMissions.map((m) => m.id),
    archivedCardIds: archivedCards.map((c) => c.id),
  }
}

export function cleanupOrphans(options: { actor?: string } = {}): {
  deletedCardIds: Array<string>
  count: number
} {
  const missions = listSwarmMissions(1000)
  const missionIds = new Set(missions.map((m) => m.id))
  const allCards = listSwarmKanbanCards({
    includeArchived: true,
    includeDeleted: false,
  })
  const deletedCardIds: Array<string> = []
  for (const card of allCards) {
    if (card.missionId != null && !missionIds.has(card.missionId)) {
      try {
        const result = deleteSwarmKanbanCard(card.id, {
          actor: options.actor,
          force: true,
        })
        if (result?.changed) deletedCardIds.push(card.id)
      } catch {
        /* continue */
      }
    }
  }
  return { deletedCardIds, count: deletedCardIds.length }
}

export function cleanupArchived(
  options: { actor?: string; olderThanMs?: number } = {},
): {
  deletedMissionIds: Array<string>
  deletedCardIds: Array<string>
  count: number
} {
  const cutoff = options.olderThanMs ? Date.now() - options.olderThanMs : 0
  const archivedMissions = listArchivedMissions().filter(
    (m) => !cutoff || (m.archivedAt ?? 0) < cutoff,
  )
  const deletedMissionIds: Array<string> = []
  const deletedCardIds: Array<string> = []

  for (const mission of archivedMissions) {
    try {
      const result = deleteMissionCascade({
        missionId: mission.id,
        actor: options.actor,
        force: true,
      })
      deletedMissionIds.push(mission.id)
      deletedCardIds.push(...result.deletedCardIds)
    } catch {
      /* continue */
    }
  }

  const archivedCards = listSwarmKanbanCards({ includeArchived: true }).filter(
    (card) =>
      isArchivedCard(card) && (!cutoff || (card.archivedAt ?? 0) < cutoff),
  )
  for (const card of archivedCards) {
    if (isDeletedCard(card)) continue
    try {
      const result = deleteSwarmKanbanCard(card.id, {
        actor: options.actor,
        force: true,
      })
      if (result?.changed) deletedCardIds.push(card.id)
    } catch {
      /* continue */
    }
  }

  return {
    deletedMissionIds,
    deletedCardIds,
    count: deletedMissionIds.length + deletedCardIds.length,
  }
}
