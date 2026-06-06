# Lifecycle Actions

This document describes the lifecycle operations available for each entity type in Hermes Workspace.

## Entity Types

| Entity        | Store                           | Lifecycle Support                       |
| ------------- | ------------------------------- | --------------------------------------- |
| Swarm Mission | `~/.hermes/swarm-missions.json` | cancel, archive, unarchive, delete      |
| Kanban Card   | `~/.hermes/swarm2-kanban.json`  | archive, unarchive, delete              |
| Task          | `~/.hermes/hermes-tasks.json`   | cancel, archive, approve, reject, retry |

---

## Actions by Entity

### Swarm Mission

| Action      | Endpoint                                 | Cascade                                                                                               |
| ----------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `cancel`    | `POST /api/swarm-missions/:id/cancel`    | Cancels all non-terminal kanban cards for this mission                                                |
| `archive`   | `POST /api/swarm-missions/:id/archive`   | Archives all non-archived kanban cards for this mission                                               |
| `unarchive` | `POST /api/swarm-missions/:id/unarchive` | Restores mission only (cards remain in their state)                                                   |
| `delete`    | `DELETE /api/swarm-missions/:id`         | Deletes mission + all associated kanban cards (requires cancelled or archived state, or `force=true`) |

### Kanban Card

| Action      | Endpoint                                   | Cascade                                                                     |
| ----------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `archive`   | `POST /api/swarm-kanban/:cardId/archive`   | Soft-marks card with `archivedAt`; excluded from default queries            |
| `unarchive` | `POST /api/swarm-kanban/:cardId/unarchive` | Clears `archivedAt`; card reappears in board                                |
| `delete`    | `DELETE /api/swarm-kanban/:cardId`         | Hard-deletes; requires card to be cancelled or archived unless `force=true` |

### Task

| Action                | Endpoint                                                | Cascade                                          |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `cancel`              | `POST /api/hermes-tasks/:id?action=cancel`              | Moves task to `deleted` column                   |
| `archive`             | `POST /api/hermes-tasks/:id?action=archive`             | Moves task to `done` column with archive comment |
| `approve`             | `POST /api/hermes-tasks/:id?action=approve`             | Unblocks task, adds approval comment             |
| `approve-and-requeue` | `POST /api/hermes-tasks/:id?action=approve-and-requeue` | Unblocks + moves to `todo`                       |
| `request-changes`     | `POST /api/hermes-tasks/:id?action=request-changes`     | Adds feedback comment                            |
| `reject`              | `POST /api/hermes-tasks/:id?action=reject`              | Moves to `backlog` with reason                   |
| `retry`               | `POST /api/hermes-tasks/:id?action=retry`               | Moves to `todo`, clears blocked reason           |

---

## Semantics

### `archived` State

- **Reversible**: archiving is a soft operation; `unarchive` restores the entity.
- **Excluded from defaults**: archived entities do not appear in default list queries unless `includeArchived=true`.
- **Reason required**: all archive operations via the UI display a `ConfirmActionDialog` requiring a reason string.
- **Cascade on mission archive**: archiving a mission archives all its non-terminal kanban cards.

### `cancelled` vs `deleted`

- **Cancelled**: entity is still readable, its state is `cancelled`/`deleted` column. Used for tasks.
- **Deleted** (hard): the record is soft-flagged with `isDeleted: true` and excluded from all queries. For missions/cards, a hard delete requires the entity to first be cancelled or archived.

### `reason` Field

- Required by the API for archive/cancel/delete on kanban cards and missions.
- Optional for task actions (defaults to a system message if omitted).
- Stored on the entity record and written to the audit log.

---

## Audit Log

All lifecycle mutations that result in a state change append a JSONL entry to:

```
~/.hermes/audit/lifecycle-YYYY-MM.jsonl
```

**Entry format:**

```json
{
  "ts": "2026-06-06T12:00:00.000Z",
  "kind": "mission",
  "target": "mission-abc123",
  "action": "archive",
  "actor": "user",
  "reason": "Sprint cleanup",
  "meta": { "archivedCardIds": ["card-1", "card-2"] }
}
```

Files rotate monthly by name. There is no automatic rotation or deletion; old files can be safely removed manually.

---

## Feature Flag

Cascade operations (mission → cards) require the `HERMES_LIFECYCLE_V2` feature flag to be enabled. Without it, only the top-level entity is mutated.

```bash
# Enable in .env
HERMES_LIFECYCLE_V2=true
```
