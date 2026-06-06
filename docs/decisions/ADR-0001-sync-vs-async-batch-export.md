---
id: ADR-0001
date: 2026-06-05
status: accepted
profile: invoiceuploader-spec
scope: feature
supersedes: null
related: []
tags:
  - requirements-discovery
  - invoicing
  - api
decision_class: BLOCKING
---

# ADR-0001: Sync vs Async for Batch Export API

## Context

During spec for invoice batch export API, the integration mode was ambiguous.
The batch export may involve 100-5000 invoices with PDF generation; the response
time could exceed HTTP timeout thresholds.

## Decision

**Chosen option:** Option B — Async (job-based, polling endpoint)

## Options Considered

### Option A: Synchronous

**Pros:** Simple client code, immediate response
**Cons:** HTTP timeout risk for large batches, no retry granularity
**Risks:** Client-side timeout failures for >200 invoices
**Reversibility:** medium

### Option B: Asynchronous (job-based)

**Pros:** Scales to any batch size, retry-safe, observable via polling
**Cons:** More complex client, requires job management
**Risks:** Client must poll; webhook alternative for future
**Reversibility:** low

## Rationale

The batch can exceed 200 invoices; synchronous HTTP would time out.
Async job pattern is already used for the CSV export (see existing codebase).

## Consequences

**Positive:** Scales without timeout risk.
**Negative:** Client code more complex.
**Follow-up actions:**

- [ ] Define job TTL
- [ ] Define polling interval recommendation

## References

- Triggered by: invoice-batch-export-spec
- Related ADRs: none (first ADR)
