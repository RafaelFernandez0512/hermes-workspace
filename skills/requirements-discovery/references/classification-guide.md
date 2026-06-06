# Decision Classification Guide — requirements-discovery

Use this guide when the Decision Classifier must assign a class to an
uncertain area. Classification is **not** a matter of opinion — apply the
heuristics below mechanically and document the reasoning in the question's
`Rationale` field.

---

## Classification Flowchart

```
Start: uncertain area identified
       │
       ▼
Is there an applicable ADR with status: accepted?
  YES → auto-resolve (cite ADR), skip classification
  NO  ↓
       │
       ▼
Would a wrong decision make the artifact INCORRECT or UNIMPLEMENTABLE?
  YES → BLOCKING
  NO  ↓
       │
       ▼
Would a wrong decision cause MATERIAL trade-off divergence?
  YES → IMPORTANT
  NO  ↓
       │
       ▼
Is it a late-bound implementation detail with no material impact?
  YES → OPTIONAL
```

---

## BLOCKING Heuristics

Classify as BLOCKING if **any** of these are true:

| Heuristic                                                        | Example                                  |
| ---------------------------------------------------------------- | ---------------------------------------- |
| Decision is **irreversible** or extremely expensive to reverse   | Multi-tenant vs single-tenant data model |
| Decision touches an **external contract** or dependency          | Which 3rd-party API version / schema     |
| Decision determines the **source of truth** for data             | Existing DB vs new DB vs external system |
| Decision defines the **security/auth boundary**                  | OIDC vs custom tokens vs API keys        |
| Decision affects **regulatory compliance**                       | Whether PII is stored and where          |
| **No safe default exists** — any guess produces incorrect output | Sync vs async for a critical integration |
| The spec would be **meaningless** without it                     | Identity model for a multi-user system   |

---

## IMPORTANT Heuristics

Classify as IMPORTANT if:

| Heuristic                                                                   | Example                                 |
| --------------------------------------------------------------------------- | --------------------------------------- |
| Decision changes **significant trade-offs** but a reasonable default exists | Cache strategy, SLA target, retry count |
| Decision affects **maintainability or operability** materially              | Observability level, log format         |
| Decision depends heavily on **domain context** (SaaS vs ERP vs Infra)       | Tenancy granularity, approval workflows |
| Wrong choice leads to **rework** but the system still works                 | Pagination cursor vs offset             |
| Profile policy overrides class to IMPORTANT                                 | (see overlay)                           |

---

## OPTIONAL Heuristics

Classify as OPTIONAL if:

| Heuristic                                                    | Example                       |
| ------------------------------------------------------------ | ----------------------------- |
| Pure **naming / style** preference                           | Table prefix, endpoint casing |
| Any choice produces a **correct system**                     | Log verbosity level           |
| Decision is **easily changed** post-launch with minimal cost | Error message text            |
| Already captured in team conventions / linting rules         | Code indentation              |

---

## Profile Policy Overrides

A profile overlay can raise or lower the class:

```yaml
classification_overrides:
  test_data_strategy: BLOCKING # QA profile raises this
  log_verbosity: IMPORTANT # Ops profile raises this
  endpoint_naming: OPTIONAL # remains OPTIONAL even if context suggests IMPORTANT
```

Overrides apply after the base classification. Document the override reason
in `Rationale` with `(class overridden by profile policy: <reason>)`.

---

## Consistency Rule

The same question asked in two identical contexts MUST produce the same
classification. If you find yourself tempted to classify differently, re-read
the BLOCKING heuristics first. When in doubt: **raise** the class (OPTIONAL →
IMPORTANT → BLOCKING), never lower without explicit policy override.

---

## Domain Modifiers

Some domains shift default classifications:

| Domain               | Modifier                                                          |
| -------------------- | ----------------------------------------------------------------- |
| **ERP / Finance**    | Compliance questions → BLOCKING; approval workflows → BLOCKING    |
| **SaaS / B2B**       | Tenancy model → BLOCKING; billing granularity → BLOCKING          |
| **Mobile**           | Offline behavior → BLOCKING; sync strategy → BLOCKING             |
| **Infrastructure**   | Blast radius → BLOCKING; rollback strategy → BLOCKING             |
| **Internal tooling** | Most IMPORTANT → OPTIONAL; few BLOCKING unless touching prod data |

Domain hints are supplied by the profile's `domain_hints` overlay field.
