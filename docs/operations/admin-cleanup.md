# Admin Cleanup

The `/api/admin/cleanup` endpoint provides controlled lifecycle cleanup of orphaned, archived, and stale resources in the Hermes Workspace.

## Endpoint

```
GET /api/admin/cleanup
```

## Query Flags

| Flag             | Type    | Default | Description                                                                    |
| ---------------- | ------- | ------- | ------------------------------------------------------------------------------ |
| `dry-run`        | boolean | `0`     | When `1`, returns counts of candidates without performing any mutations        |
| `orphans`        | boolean | `0`     | Process kanban cards with a `missionId` that references a non-existent mission |
| `archived`       | boolean | `0`     | Purge entities that have been archived for more than 30 days                   |
| `stale-sessions` | boolean | `0`     | Remove session directories older than 90 days with no active tasks linked      |

## Example Requests

**Dry run — show what would be cleaned up:**

```bash
curl 'http://localhost:3000/api/admin/cleanup?dry-run=1&orphans=1&archived=1&stale-sessions=1'
```

**Apply orphan cleanup only:**

```bash
curl 'http://localhost:3000/api/admin/cleanup?orphans=1'
```

**Full cleanup (no dry run):**

```bash
curl 'http://localhost:3000/api/admin/cleanup?orphans=1&archived=1&stale-sessions=1'
```

## Response Format

```json
{
  "dryRun": true,
  "counts": {
    "orphanedCards": 3,
    "archivedMissions": 1,
    "archivedCards": 12,
    "staleSessions": 5
  },
  "orphanedCardIds": ["card-abc", "card-def", "card-ghi"],
  "archivedMissionIds": ["mission-xyz"]
}
```

When `dry-run=0`, the response includes `deletedCardIds`, `deletedMissionIds`, and `removedSessionPaths`.

## Expected Output

Each category produces a count in the response:

- **orphanedCards**: Cards whose `missionId` points to a deleted or non-existent mission.
- **archivedMissions**: Missions in `archived` state older than 30 days.
- **archivedCards**: Kanban cards in `archived` status older than 30 days.
- **staleSessions**: Session directories with no associated active task and last activity > 90 days.

## Running from the Admin Panel

Navigate to `/admin` in the Hermes Workspace UI and click **Cleanup** in the Lifecycle section. The panel uses `dry-run=1` by default; toggle to apply the cleanup.

## Permissions

Requires a valid auth token. In development (`NODE_ENV=development`), the endpoint is accessible without authentication.

## Audit Log

Every non-dry-run cleanup appends entries to `~/.hermes/audit/lifecycle-YYYY-MM.jsonl` with `action: "cleanup"`.
