---
id: ADR-0002
date: 2026-06-06
status: accepted
profile: invoiceuploader-spec
scope: feature
supersedes: null
related:
  - ADR-0001
tags:
  - requirements-discovery
  - invoicing
  - api
  - activation-scope
decision_class: BLOCKING
---

# ADR-0002: Requirements Discovery Gate — Activation Scope for Invoice API Design

## Context

During the smoke test for the `requirements-discovery` skill closeout, the spec
prompt "design an API for invoice ingestion" triggered the discovery gate. The
gate needed to decide whether to activate for this domain-generic request or
apply a narrow scope limited to InvoiceUploader's existing upload flow.

Two conflicting interpretations existed:

- **Broad activation**: Treat any API design prompt as in-scope, even if the
  domain is partially covered by existing ADRs.
- **Narrow activation**: Only activate for gaps not covered by existing ADRs;
  auto-resolve known decisions from ADR-0001.

## Decision

**Chosen option:** Option A — Broad activation with Knowledge Reuse Layer suppression

The gate activates for all API design prompts. Known decisions (e.g., async
job pattern from ADR-0001) are auto-resolved and not re-asked. Only genuinely
new decisions surface as BLOCKING questions.

## Options Considered

### Option A: Broad activation with KRL suppression

**Pros:**

- Zero missed ambiguity — every design gets a full scan
- Auto-resolve via KRL avoids redundant questions

**Cons:**

- Slightly more compute for Context Analyzer phase

**Risks:**

- KRL false-positive suppress could silence a legitimately new question
  (mitigated by conflict-resolution flow)

**Reversibility:** high
**Cost signal:** low

### Option B: Narrow activation (ADR-covered domains skip gate)

**Pros:**

- Faster for well-specified domains

**Cons:**

- Misses new ambiguity in partially-specified domains
- Requires maintaining an explicit "skip list"

**Risks:**

- Design errors from undetected ambiguity in edge cases

**Reversibility:** medium
**Cost signal:** medium

## Rationale

Option A aligns with the skill's invariant: no assumption should pass undetected.
The Knowledge Reuse Layer handles the suppression of already-decided questions
cleanly without requiring a manual skip list. ADR-0001 confirmed the async pattern
for batch export — the gate would auto-resolve that decision and only surface
ingestion-specific questions (e.g., idempotency key, schema validation location).

## Consequences

**Positive:**

- Consistent gate behavior across all design prompts.
- Reuse of ADR-0001 (async pattern) auto-applied to ingestion API job dispatch.

**Negative / accepted trade-offs:**

- Context Analyzer runs even for low-ambiguity prompts.

**Follow-up actions:**

- [ ] Add `activation_scope: broad` as default in `policy.default.yaml` explicitly
- [ ] Validate KRL auto-resolve in second invocation (see validation report §12.4)

## References

- Triggered by: requirements-discovery closeout smoke test
- Related ADRs: ADR-0001 (async job pattern)
- Hindsight candidate: hindsight://hermes/ADR-0002
- Profile policy: skills/requirements-discovery/policy.default.yaml
