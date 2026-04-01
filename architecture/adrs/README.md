# Architecture Decision Records

This directory contains ADRs (Architecture Decision Records) for the School Operating System. Each ADR documents a significant architectural decision, its context, the reasoning behind it, and its consequences.

## Index

| ADR                                                   | Title                                              | Status                         | Date       |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------------------ | ---------- |
| [ADR-001](ADR-001-prisma-direct-reads.md)             | Prisma-Direct Reads for Cross-Module Data Access   | Accepted (with migration plan) | 2026-04-01 |
| [ADR-002](ADR-002-survey-responses-no-rls.md)         | survey_responses Table Has No tenant_id and No RLS | Accepted                       | 2026-04-01 |
| [ADR-003](ADR-003-tenant-aware-job-raw-sql.md)        | TenantAwareJob Uses Raw SQL for RLS Context        | Accepted                       | 2026-04-01 |
| [ADR-004](ADR-004-sub-module-extraction-pattern.md)   | Module Sub-Module Extraction Pattern               | Accepted                       | 2026-04-01 |
| [ADR-005](ADR-005-cross-cutting-dependency-review.md) | Require ADR for New Cross-Cutting Dependencies     | Accepted                       | 2026-04-01 |

## When to Write an ADR

Per ADR-005, an ADR is required for any PR that introduces:

1. A new `APP_GUARD` or `APP_INTERCEPTOR` (global scope)
2. A new service exported by a Tier 1 or Tier 2 module
3. A new cross-module dependency where module A imports module B for the first time
4. A new `forwardRef()` usage (circular dependency)
5. A new table that will be read by 3+ modules

## ADR Format

```markdown
# ADR-NNN: Title

**Status**: Proposed | Accepted | Deprecated | Superseded by ADR-NNN
**Date**: YYYY-MM-DD

## Context

What is the issue that is motivating this decision or change?

## Decision

What is the change that is being proposed or has been agreed upon?

## Consequences

### Positive

- ...

### Negative

- ...

### Mitigations

- ...
```

## Numbering

ADRs are numbered sequentially. If an ADR is superseded, the old ADR's status is updated to "Superseded by ADR-NNN" and the new ADR references the old one in its Context section. Numbers are never reused.
