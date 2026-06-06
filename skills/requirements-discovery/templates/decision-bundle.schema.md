# Decision Bundle Schema — requirements-discovery

The Decision Bundle is the output contract of the `requirements-discovery`
skill. It is passed to the caller (spec writer, architect, developer) so they
can produce a correct artifact without re-asking resolved questions.

---

## Schema (Markdown rendering for agent consumption)

````markdown
## Decision Bundle — <mission title>

Generated: <ISO8601 timestamp>
Profile: <profile-id>
Skill version: 1.0.0
Total decisions: N (B blocking confirmed, I important confirmed/defaulted, O optional defaulted)

### Resolved Decisions

| #   | Question        | Answer                 | ADR      | Class     | Method                   |
| --- | --------------- | ---------------------- | -------- | --------- | ------------------------ |
| 1   | <question text> | <chosen option label>  | ADR-NNNN | BLOCKING  | Human-confirmed          |
| 2   | <question text> | <chosen option label>  | ADR-NNNN | IMPORTANT | Human-confirmed          |
| 3   | <question text> | <default option label> | ADR-NNNN | IMPORTANT | Default applied          |
| 4   | <question text> | <auto option label>    | ADR-0001 | OPTIONAL  | Auto-resolved (ADR-0001) |

### Applied Defaults (IMPORTANT — no human response)

- **<topic>**: `<default_value>` — rationale: <1 line>
- **<topic>**: `<default_value>` — rationale: <1 line>

### Auto-Resolved (Knowledge Reuse)

- **<topic>**: resolved via `ADR-NNNN` — <1 line summary of the prior decision>

### Optional Defaults Applied (not shown during gate)

- **<topic>**: `<default_value>`
- **<topic>**: `<default_value>`

### Blocked Items (awaiting input — NEEDS_INPUT emitted)

- **<topic>**: Checkpoint emitted at <timestamp>. Awaiting `/api/swarm-assignment-response`.

### Telemetry Events Emitted

```json
{"event": "skill-activated", "profile": "<id>", "mission": "<title>", "ts": "<ISO8601>"}
{"event": "decision-asked", "id": "B-001", "class": "BLOCKING", "ts": "<ISO8601>"}
{"event": "decision-resolved", "adr_id": "ADR-NNNN", "class": "BLOCKING", "method": "human", "ts": "<ISO8601>"}
{"event": "adr-written", "adr_id": "ADR-NNNN", "path": "docs/decisions/ADR-NNNN-slug.md", "ts": "<ISO8601>"}
{"event": "skill-complete", "total": N, "blocking": B, "important": I, "optional": O, "ts": "<ISO8601>"}
```
````

````

---

## Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mission title` | string | yes | The user's original request/goal |
| `Generated` | ISO8601 | yes | Timestamp when bundle was produced |
| `Profile` | string | yes | Profile ID of the invoking agent |
| `Total decisions` | int | yes | Count by class |
| `Question` | string | yes | Verbatim question from Phase 5 |
| `Answer` | string | yes | Label of chosen option |
| `ADR` | string | yes | ID of written ADR (`ADR-NNNN`) |
| `Class` | enum | yes | `BLOCKING \| IMPORTANT \| OPTIONAL` |
| `Method` | enum | yes | `Human-confirmed \| Default applied \| Auto-resolved` |

---

## Machine-Readable Format (optional, for orchestrator parsing)

```json
{
  "schema_version": "1.0",
  "mission": "<title>",
  "generated": "<ISO8601>",
  "profile": "<profile-id>",
  "decisions": [
    {
      "seq": 1,
      "question": "<text>",
      "answer": "<option label>",
      "adr_id": "ADR-NNNN",
      "decision_class": "BLOCKING",
      "method": "human-confirmed",
      "rationale": "<1 line>"
    }
  ],
  "blocked": [],
  "telemetry_events": 5
}
````
