# ADR-001: Prisma-Direct Reads for Cross-Module Data Access

**Status**: Accepted (with migration plan)
**Date**: 2026-04-01

## Context

The codebase contains many places where a NestJS module reads another module's table directly via the shared `PrismaService`, rather than importing and calling the owning module's service. For example, a timetable query may join the `students` table directly instead of going through `StudentsService`.

This pattern emerged organically: injecting `PrismaService` is cheap, avoids circular-dependency issues, and keeps inter-module coupling explicit at the database layer. However, it means that any schema change to a table (renaming a column, moving data to a related table, changing an enum) can silently break modules that are not owned by the team responsible for that table.

At 300k+ LOC across a modular monolith, holding all cross-module read paths in memory is no longer practical.

## Decision

Prisma-direct reads across module boundaries are **permitted for now** under the following rules:

1. **Reads only** — writes and mutations must always go through the owning module's service.
2. **No raw SQL** — use the Prisma query builder so that type errors surface at compile time.
3. **Grep before schema changes** — any change to a tenant-scoped table must be preceded by a codebase-wide search for usages outside the owning module (`grep -r "prisma.table_name"`) and those call sites must be updated in the same PR.
4. **Façades are the migration target** — work items A-16 through A-19 introduce thin read-façade services for the most-accessed cross-boundary tables. As each façade lands, existing direct reads in that domain are migrated to use it.

The long-term goal is that every cross-module data access goes through a façade or a published query method on the owning service, eliminating silent breakage.

## Consequences

### Positive

- No immediate churn — existing code continues to work while façades are introduced incrementally.
- Prisma type-safety still catches most structural breakage at compile time.

### Negative

- Schema changes require a manual grep step; this is not enforced by tooling and depends on developer discipline.
- Until façades are in place, the blast radius of any schema change is underestimated by looking only at the owning module.
- New developers may replicate the pattern without realising it is in migration; code review must catch this.

### Mitigations

- `architecture/module-blast-radius.md` documents known cross-module read paths per table — keep this updated.
- CI type-check will surface compile-time breakage even if the grep step is missed.
- PR reviewers must reject new direct reads added after façades exist for that domain.
