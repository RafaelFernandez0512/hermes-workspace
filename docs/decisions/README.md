# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records produced by the
`requirements-discovery` skill. Each ADR captures a confirmed decision
made before or during the creation of a spec, feature, architecture, or plan.

---

## Naming Convention

```
ADR-NNNN-<slug>.md
```

- `NNNN` — zero-padded 4-digit sequential number starting at `0001`.
- `<slug>` — lowercase, hyphenated summary of the decision.
  Example: `ADR-0001-tenancy-model.md`, `ADR-0002-auth-strategy.md`.

Template: `ADR-0000-template.md` (this directory).

---

## ADR Lifecycle

| Status       | Meaning                                          |
| ------------ | ------------------------------------------------ |
| `proposed`   | Under review / awaiting approval                 |
| `accepted`   | Confirmed by human; active decision              |
| `superseded` | Replaced by a newer ADR (see `supersedes` field) |
| `deprecated` | No longer applicable; kept for history           |

The `requirements-discovery` skill writes ADRs with `status: accepted`
after human confirmation via `/api/swarm-assignment-response`.

---

## Frontmatter Fields

| Field            | Required | Description                                        |
| ---------------- | -------- | -------------------------------------------------- |
| `id`             | yes      | `ADR-NNNN`                                         |
| `date`           | yes      | ISO date created                                   |
| `status`         | yes      | `proposed \| accepted \| superseded \| deprecated` |
| `profile`        | yes      | Profile that triggered the decision                |
| `scope`          | yes      | `feature \| system \| org`                         |
| `supersedes`     | no       | `ADR-XXXX` if this replaces a prior decision       |
| `related`        | no       | List of related ADR IDs                            |
| `tags`           | yes      | At minimum `requirements-discovery` + topic tags   |
| `decision_class` | yes      | `BLOCKING \| IMPORTANT \| OPTIONAL`                |

---

## Searching ADRs

```bash
# All accepted ADRs
grep -l "status: accepted" docs/decisions/*.md

# By topic tag
grep -rl "tenancy" docs/decisions/

# By profile
grep -rl "profile: invoiceuploader-spec" docs/decisions/

# By class
grep -rl "decision_class: BLOCKING" docs/decisions/
```

---

## Index

| ID  | Slug | Status | Scope | Profile | Date |
| --- | ---- | ------ | ----- | ------- | ---- |

<!-- ADRs are appended below this line by the requirements-discovery skill -->
