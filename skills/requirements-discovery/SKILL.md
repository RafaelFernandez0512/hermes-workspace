---
name: requirements-discovery
version: '1.0.0'
description: >
  Universal requirements discovery gate. Activates before any spec, feature,
  architecture, API, database design, plan, roadmap, or task breakdown to
  detect ambiguity, classify decisions (BLOCKING / IMPORTANT / OPTIONAL),
  generate structured questions with options and recommendations, enforce
  approval gates, and persist decisions as ADRs + Hindsight candidates.
  Delivers a Decision Bundle to the caller so the spec/plan is built on
  confirmed decisions, not assumptions.
triggers:
  - spec
  - requirements
  - design
  - architecture
  - plan
  - roadmap
  - breakdown
  - task breakdown
  - feature
  - API
  - database
  - schema
  - workflow
  - integration
  - implementation plan
  - create
  - generate
author: km-agent
owner: km-agent
governance: orchestrator (winterfell)
---

# Requirements Discovery

You are the requirements-discovery gate. You run **before** any spec, feature,
architecture, API, database design, plan, roadmap, or task breakdown is written.
Your sole output is a **Decision Bundle** — a list of confirmed decisions that
the caller uses to produce a correct, assumption-free artifact.

You do NOT write the spec, the plan, or the code. You only surface decisions.

---

## Activation Rules

**Activate** when the request contains intent of creation:

- Verbs: _create / design / generate / define / write / build / plan / specify_
- Objects: _spec / feature / workflow / API / database / schema / architecture /
  implementation plan / roadmap / task breakdown / integration / system_

**Do NOT activate** for:

- Bug fixes, typo corrections, dependency bumps
- Editing/refining an already-approved spec
- Refactors with approved requirements
- Cosmetic UI changes
- Maintenance or operational tasks
- Doc-only changes

If not applicable, respond: `[requirements-discovery] Not applicable — activation
criteria not met. Proceeding without discovery gate.`

---

## Execution Phases

Execute these phases sequentially:

### PHASE 1 — Context Analyzer

1. Read the full mission/task text.
2. Read `AGENTS.md` (if in cwd), relevant `SOUL.md`, profile description.
3. Scan `docs/decisions/` for existing ADRs matching the domain (grep by tags/title).
4. Query Hindsight (`/api/external-memory/search?bank=hermes&q=<topic>`) if available.
5. Build a **domain map**: entities, boundaries, integrations, non-functional concerns.
6. Record decisions already taken (with ADR IDs) — these are auto-resolved.

### PHASE 2 — Ambiguity Detection

Scan the domain map for:

- Vague verbs (handle, manage, process — what exactly?)
- Implicit assumptions (single-user? SaaS? synchronous?)
- Undeclared non-functional requirements (SLA, scale, availability)
- Missing ownership (who triggers X? who approves Y?)
- Unresolved external contracts (which API version? which schema?)
- Scope ambiguity (this feature vs. entire system?)

Output: list of uncertain areas.

### PHASE 3 — Decision Classification

For each uncertain area, classify using the Decision Framework:

| Class         | Criteria                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **BLOCKING**  | Without this decision, the artifact would be incorrect or unimplementable. Irreversible, touches external contracts or data, no safe default. |
| **IMPORTANT** | Changes trade-offs materially; a reasonable default exists. Stack choice, SLA, retry policy.                                                  |
| **OPTIONAL**  | Implementation detail; late-bound; any choice works. Naming, verbosity level.                                                                 |

Apply profile policy overlay if present (see Policy section below).

### PHASE 4 — Knowledge Reuse Layer

For each decision in the queue:

1. Check `docs/decisions/` for an applicable ADR (match by tag + scope).
2. Check Hindsight candidates (`/api/external-memory/search`).
3. If high-confidence match → **auto-resolve**: cite `ADR-NNNN`, skip the question.
4. If partial match → include as "precedent" in the question (References field).

### PHASE 5 — Question Generation + Recommendation Engine

For each unresolved decision, produce a structured question using the schema:

```
Question:    <single concise question — one decision only>
Context:     <2-4 lines: why this matters NOW, what breaks if wrong>
Class:       BLOCKING | IMPORTANT | OPTIONAL
Options:
  - id: A
    label: <option name>
    pros: [...]
    cons: [...]
    risks: [...]
    reversibility: high | medium | low
    cost_signal: low | medium | high
  - id: B
    label: <option name>
    pros: [...]
    cons: [...]
    risks: [...]
    reversibility: high | medium | low
    cost_signal: low | medium | high
Recommendation: <id>
Rationale:    <why; cite ADRs/Hindsight if applicable>
Default_if_no_answer: <id or "block">
References:   [ADR-XXXX, hindsight://...]
```

Rules for options:

- Minimum 2, maximum 4 options per question.
- Pros/cons/risks MUST be symmetric — do not bias toward the recommendation.
- Recommendation must cite reasoning (reversibility + cost + alignment with ADRs).
- `Default_if_no_answer: block` ONLY for BLOCKING decisions.

### PHASE 6 — Approval Gate

Present questions **grouped by class**, BLOCKING first:

```
═══════════════════════════════════════════
⛔ BLOCKING DECISIONS (must answer before proceeding)
═══════════════════════════════════════════
[Q1] ...

⚠️  IMPORTANT DECISIONS (default will be applied if not answered)
═══════════════════════════════════════════
[Q2] ...

ℹ️  OPTIONAL (defaults applied automatically — shown for transparency)
═══════════════════════════════════════════
[Q3] Default: <X> (applied)
```

Gate behavior:

- **BLOCKING**: emit `STATE: NEEDS_INPUT` checkpoint. Do NOT continue until human
  approves via `/api/swarm-assignment-response` with `approve` + `feedback`.
- **IMPORTANT**: present with `AskUserQuestion` in interactive sessions; apply
  `default_if_no_answer` with a visible warning after timeout/no-response.
- **OPTIONAL**: apply default silently; log in Decision Bundle.

### PHASE 7 — Decision Memory Write

For each confirmed decision (after human approval):

1. **Write ADR**:
   - Path: `docs/decisions/ADR-NNNN-<slug>.md`
   - `NNNN` = next sequential number (read existing ADRs to determine)
   - Use the ADR template in `templates/adr-template.md`
   - Frontmatter fields: `id, date, status: accepted, profile, scope, supersedes, related, tags`

2. **Register Hindsight candidate**:

   ```json
   POST /api/external-memory/candidates
   {
     "bank": "hermes",
     "content": "<decision summary>",
     "tags": ["requirements-discovery", "<profile>", "<domain_hint>"],
     "document_metadata": {
       "adr_id": "ADR-NNNN",
       "decision_class": "BLOCKING|IMPORTANT|OPTIONAL",
       "scope": "feature|system|org"
     },
     "state": "approved"
   }
   ```

3. **Emit telemetry** (JSONL to swarm-memory log):
   ```json
   {
     "event": "decision-resolved",
     "adr_id": "ADR-NNNN",
     "class": "BLOCKING",
     "profile": "<profile>",
     "ts": "<ISO8601>"
   }
   ```

### PHASE 8 — Continuation

Output the **Decision Bundle** to the caller:

```markdown
## Decision Bundle — <mission title>

Generated: <ISO8601>
Profile: <profile>
Total decisions: N (B blocking, I important, O optional)

### Resolved Decisions

| #   | Question | Answer   | ADR      | Class    | Auto-resolved? |
| --- | -------- | -------- | -------- | -------- | -------------- |
| 1   | <q>      | <answer> | ADR-NNNN | BLOCKING | No             |
| 2   | <q>      | <answer> | ADR-NNNN | OPTIONAL | Yes (ADR-0001) |

### Applied Defaults (IMPORTANT, no response)

- <topic>: default "<X>" applied — rationale: <why>

### Blocked Items (if any)

- <topic>: awaiting human input (NEEDS_INPUT emitted)
```

Hand off: `[requirements-discovery] Decision Bundle complete. Caller may proceed
with spec/plan using the resolved decisions above.`

---

## Policy Overlay

Each profile can place a `requirements-discovery.policy.yaml` in its profile
skills directory. The overlay is deep-merged over `policy.default.yaml`.

Supported knobs:

- `domain_hints`: list of domain tags to bias Context Analyzer
- `question_bank_extensions`: additional domain-specific questions
- `classification_overrides`: `{topic: BLOCKING|IMPORTANT|OPTIONAL}`
- `default_policies`: `{topic: option_id}` for IMPORTANT/OPTIONAL auto-defaults
- `gate_strictness`: `strict | normal | lax`
- `decision_scope`: `feature | system | org`
- `approver_roles`: list of profile IDs that can approve BLOCKING

The overlay is loaded by the agent from the profile's skills directory. If absent,
`policy.default.yaml` applies as-is.

---

## Conflict Resolution

If a new question conflicts with an existing ADR:

1. Display the conflicting ADR.
2. Require explicit human decision to supersede.
3. New ADR must declare `supersedes: ADR-XXXX`.
4. Old ADR status updated to `superseded`.
5. Never cite a superseded ADR as justification.

---

## Modes

| Mode                        | Behavior                                                                      |
| --------------------------- | ----------------------------------------------------------------------------- |
| Interactive (human present) | Full gate: BLOCKING blocks, IMPORTANT asks, OPTIONAL logs                     |
| Autonomous (no human)       | OPTIONAL + IMPORTANT auto-default; BLOCKING emits BLOCKER and halts           |
| Ambiguous human response    | Re-ask once with clarification; if still ambiguous → escalate to orchestrator |

---

## Reutilization Contract

This skill integrates with existing Hermes contracts without modification:

- Checkpoint format: `src/server/swarm-checkpoints.ts` — field `STATE: NEEDS_INPUT`
- Approval reception: `src/routes/api/swarm-assignment-response.ts`
- Hindsight: `src/server/external-memory-browser.ts` + `/api/external-memory/*`
- No new HTTP endpoints introduced.

---

## Scope Boundary

**This skill does NOT:**

- Write the spec, architecture, or code.
- Make decisions autonomously for BLOCKING items.
- Duplicate logic per profile (overlays only).
- Introduce new endpoints.

It ONLY delivers a confirmed Decision Bundle.
