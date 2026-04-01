# ADR-005: Require ADR for New Cross-Cutting Dependencies

**Status**: Accepted
**Date**: 2026-04-01

## Context

Cross-cutting dependencies (global guards, shared services consumed by 3+ modules, new Tier 1/2 services) have outsized blast radius. Adding one without documentation leads to:

- Unknown consumers that break silently on interface changes
- No visibility into why the dependency was introduced
- Difficulty removing or replacing the dependency later

## Decision

Any PR that introduces one of the following MUST include an ADR:

1. A new `APP_GUARD` or `APP_INTERCEPTOR` (global scope)
2. A new service exported by a Tier 1 or Tier 2 module (see module-blast-radius.md)
3. A new cross-module dependency where module A imports module B for the first time
4. A new `forwardRef()` usage (circular dependency)
5. A new table that will be read by 3+ modules

The ADR should document: what, why, alternatives considered, blast radius, and rollback plan.

## Consequences

- PRs adding cross-cutting deps without an ADR should be flagged in review
- ADRs live in `architecture/adrs/` and are indexed in `architecture/adrs/README.md`
- This process is enforced by code review, not CI (human judgment required)
