# Universal Question Bank — requirements-discovery

This bank contains domain-agnostic questions organized by concern area.
The Context Analyzer uses these as a starting checklist; not all questions
apply to every mission. Questions marked `[ALWAYS]` are checked on every
activation. Others are checked only when the domain map contains the
relevant entities.

Profile-specific extensions belong in `policy.overlay.yaml` under
`question_bank_extensions`, not here.

---

## [ALWAYS] Identity & Tenancy

| ID    | Question                                                           | Default Class |
| ----- | ------------------------------------------------------------------ | ------------- |
| B-001 | Single-tenant or multi-tenant architecture?                        | BLOCKING      |
| B-002 | Who is the primary actor (user role, system, scheduled job)?       | BLOCKING      |
| B-003 | Is there a concept of ownership/isolation per record/entity?       | BLOCKING      |
| I-001 | What is the expected scale at launch (users, records, events/sec)? | IMPORTANT     |

## [ALWAYS] Data & Source of Truth

| ID    | Question                                                        | Default Class |
| ----- | --------------------------------------------------------------- | ------------- |
| B-010 | What is the single source of truth for the primary data entity? | BLOCKING      |
| B-011 | Are there external systems that own data we must read or write? | BLOCKING      |
| B-012 | Does this feature create, modify, or delete persistent state?   | BLOCKING      |
| I-010 | What is the data retention / archival policy?                   | IMPORTANT     |
| I-011 | Is PII involved? What is the anonymization/deletion strategy?   | IMPORTANT     |
| O-010 | What is the preferred ID format (UUID, sequential, slug)?       | OPTIONAL      |

## [ALWAYS] Integration & Contracts

| ID    | Question                                                                   | Default Class |
| ----- | -------------------------------------------------------------------------- | ------------- |
| B-020 | Does this feature depend on an external API or service contract?           | BLOCKING      |
| B-021 | Is the integration synchronous (request/response) or async (events/queue)? | BLOCKING      |
| I-020 | What happens when the external dependency is unavailable?                  | IMPORTANT     |
| I-021 | What is the retry / circuit-breaker strategy?                              | IMPORTANT     |
| O-020 | What is the timeout value for synchronous calls?                           | OPTIONAL      |

## Authentication & Authorization

| ID    | Question                                                             | Default Class |
| ----- | -------------------------------------------------------------------- | ------------- |
| B-030 | What authentication mechanism is required?                           | BLOCKING      |
| B-031 | What authorization model? (RBAC, ABAC, ownership-based, none)        | BLOCKING      |
| I-030 | Are there row-level security or field-level permission requirements? | IMPORTANT     |
| I-031 | Do external tokens need to be stored? Where and how?                 | IMPORTANT     |

## API Design

| ID    | Question                                                | Default Class |
| ----- | ------------------------------------------------------- | ------------- |
| B-040 | REST, GraphQL, gRPC, or event-driven interface?         | BLOCKING      |
| B-041 | What versioning strategy? (URL path, header, none)      | BLOCKING      |
| I-040 | What is the pagination strategy for list endpoints?     | IMPORTANT     |
| I-041 | What error format? (RFC 7807, custom, provider-default) | IMPORTANT     |
| O-040 | What is the base path / URL prefix?                     | OPTIONAL      |
| O-041 | What is the naming convention for endpoints?            | OPTIONAL      |

## Database & Storage

| ID    | Question                                                             | Default Class |
| ----- | -------------------------------------------------------------------- | ------------- |
| B-050 | What database/storage technology? (already chosen or needs decision) | BLOCKING      |
| B-051 | Does this feature require schema migrations?                         | BLOCKING      |
| I-050 | Read/write ratio and query patterns? (index strategy)                | IMPORTANT     |
| I-051 | Does the feature require transactions? What isolation level?         | IMPORTANT     |
| O-050 | Table/collection naming convention?                                  | OPTIONAL      |

## Non-Functional Requirements

| ID    | Question                                                             | Default Class                      |
| ----- | -------------------------------------------------------------------- | ---------------------------------- |
| B-060 | Is there a defined SLA (availability, response time, throughput)?    | BLOCKING (if externally committed) |
| I-060 | What observability is required? (metrics, logs, traces, alerts)      | IMPORTANT                          |
| I-061 | What is the rollback/recovery strategy if the feature breaks prod?   | IMPORTANT                          |
| I-062 | Are there compliance/regulatory constraints? (GDPR, SOX, PCI, HIPAA) | IMPORTANT                          |
| O-060 | What log verbosity level?                                            | OPTIONAL                           |

## Migration & Deployment

| ID    | Question                                                               | Default Class                    |
| ----- | ---------------------------------------------------------------------- | -------------------------------- |
| B-070 | Big-bang migration or gradual/strangler fig?                           | BLOCKING (if migration involved) |
| B-071 | Can the new and old version coexist? (backward compatibility contract) | BLOCKING (if replacing existing) |
| I-070 | What is the rollout strategy? (feature flag, canary, full deploy)      | IMPORTANT                        |
| I-071 | What is the expected downtime window (if any)?                         | IMPORTANT                        |

## Workflow & Approval

| ID    | Question                                                       | Default Class        |
| ----- | -------------------------------------------------------------- | -------------------- |
| B-080 | Does the feature have approval/review states? Who can approve? | BLOCKING (if stated) |
| B-081 | Are there terminal states from which reversal is impossible?   | BLOCKING             |
| I-080 | What is the notification strategy for state changes?           | IMPORTANT            |

---

## Question Bank Extension Format (for profile overlays)

```yaml
question_bank_extensions:
  - id: 'CUSTOM-001'
    question: 'Your domain-specific question?'
    default_class: BLOCKING
    domain_hint: erp
    always_check: false
```
