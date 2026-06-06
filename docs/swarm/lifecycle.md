# Swarm Lifecycle — States, Transitions, Cascade, and Idempotency

## State machines

### SwarmMission states

```
planning ──► dispatching ──► executing ──► reviewing ──► complete
    │               │              │             │
    └───────────────┴──────────────┴─────────────┴──► cancelled
                                                            │
                                                            ▼
                                                         archived
                                                            │
                                                      (soft-delete)
                                                            │
                                                            ▼
                                                         deleted (isDeleted=true)
```

| State         | Description                                              |
| ------------- | -------------------------------------------------------- |
| `planning`    | Brief received, not yet dispatched                       |
| `dispatching` | Orchestrator loop is assigning workers                   |
| `executing`   | At least one assignment is in-flight                     |
| `reviewing`   | All assignments done, awaiting human review              |
| `blocked`     | Assignment waiting on human input                        |
| `complete`    | All assignments done and accepted                        |
| `cancelled`   | Stopped before completion                                |
| `archived`    | Soft-archived; excluded from default queries; reversible |

### SwarmKanbanCard statuses

Lanes: `backlog | todo | ready | running | review | blocked | done | archived`

- Archived cards are hidden from the board by default. Toggle **Show archived** to reveal them.
- The `archived` lane is not rendered in the board grid — it acts as a filter-only state.

### SwarmMissionAssignment states

`queued → waiting_on_dependency → dispatched → executing → checkpointed / blocked / stale / needs_input → reviewing → done | cancelled`

---

## Lifecycle operations

### Cancel

**Rule:** Stops any active assignment executions. Cascades to all non-terminal assignments.

```
cancelMissionCascade({ missionId, actor, reason })
```

- Sets mission state → `cancelled`, all non-terminal assignments → `cancelled`.
- With `HERMES_LIFECYCLE_V2=true`: sets related kanban cards to `blocked` (they are not done).
- Idempotent: calling again when already cancelled is a no-op (`changed: false`).
- Audit: `cancelledAt`, `cancelledBy`, `cancelReason` written to the mission record.

### Archive

**Rule:** Soft-marks the entity. Reversible. Excluded from default list queries.

```
archiveMissionCascade({ missionId, actor, reason })
```

- Sets mission state → `archived`.
- Active assignments are cancelled first.
- With `HERMES_LIFECYCLE_V2=true`: cascades to all active kanban cards of the mission (sets their status → `archived`).
- Idempotent: archiving an already-archived entity returns `changed: false`.
- Audit: `archivedAt`, `archivedBy`, `archiveReason` written to the record.

To reverse: `unarchiveMission({ missionId, actor })` — sets state back to `cancelled`.

### Delete

**Rule:** Hard (logical) delete. Only allowed on `cancelled`, `archived`, or `complete` missions unless `force=true`.

```
deleteMissionCascade({ missionId, actor, reason, force? })
```

- Sets `isDeleted: true`, `deletedAt`, `deletedBy`, `deleteReason`.
- With `HERMES_LIFECYCLE_V2=true`: also sets `isDeleted: true` on all child kanban cards.
- Not reversible.
- Throws if mission is in an active state and `force` is not set.

---

## Idempotency guarantees

All three operations check the current state before writing:

- Cancel on a cancelled mission → `changed: false`, no new events emitted.
- Archive on an archived mission → `changed: false`, no new events emitted.
- Delete on a deleted mission → `changed: false`.

All writes are atomic: a `.tmp` file is written then renamed, preventing partial writes.

---

## Cascade rules (HERMES_LIFECYCLE_V2=true)

| Operation | Mission effect    | Child card effect                  |
| --------- | ----------------- | ---------------------------------- |
| Cancel    | state → cancelled | non-done cards → blocked           |
| Archive   | state → archived  | non-archived cards → archived      |
| Delete    | isDeleted → true  | all child cards → isDeleted = true |

When `HERMES_LIFECYCLE_V2=false` (production default), cascade to kanban cards is skipped.

---

## Admin cleanup endpoints

All require authentication. Return 503 if `HERMES_LIFECYCLE_V2` is disabled.

### `GET /api/admin/cleanup?action=dry-run`

Returns counts of orphaned cards, archived missions/cards, stale sessions. No mutations.

### `POST /api/admin/cleanup`

Body: `{ action: string, actor?: string, dryRun?: boolean, olderThanHours?: number }`

| action           | Effect                                                  |
| ---------------- | ------------------------------------------------------- |
| `dry-run`        | Preview only, no mutations                              |
| `orphans`        | Delete kanban cards whose missionId no longer exists    |
| `archived`       | Hard-delete all archived missions and their child cards |
| `stale-sessions` | Archive missions idle >6h with all assignments terminal |

---

## Feature flag

Set `HERMES_LIFECYCLE_V2=true` to enable cascade behavior and admin cleanup endpoints.

Default: `true` in `development` and `test`, `false` in `production`.

Runtime override (client-side only, for testing):

```js
window.__HERMES_FLAGS__ = { LIFECYCLE_V2: true }
```

---

## Usage examples

### Cancel a mission from the API

```bash
curl -X POST http://localhost:3002/api/swarm-missions/$MISSION_ID/cancel \
  -H 'Content-Type: application/json' \
  -d '{ "actor": "eric", "reason": "Scope changed", "graceful": true }'
```

### Archive a mission with cascade

```bash
HERMES_LIFECYCLE_V2=true curl -X POST \
  http://localhost:3002/api/swarm-missions/$MISSION_ID/archive \
  -H 'Content-Type: application/json' \
  -d '{ "actor": "eric", "cascade": true }'
```

### Run cleanup dry-run

```bash
curl http://localhost:3002/api/admin/cleanup?action=dry-run
```

### Run migration (idempotent)

```bash
pnpm tsx scripts/migrate-lifecycle.ts --dry-run   # preview
pnpm tsx scripts/migrate-lifecycle.ts              # apply
```
