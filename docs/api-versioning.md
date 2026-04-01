# API Versioning Strategy

The API currently ships under `/v1/*`. This document defines when a new version is required and how to evolve endpoints without breaking tenant workflows.

## Principles

1. Prefer additive change inside `v1` whenever possible.
2. Introduce `v2` only for breaking changes that cannot be safely expressed through optional fields, new endpoints, or compatibility shims.
3. Keep version decisions explicit in code review. "Probably fine" is not enough for tenant-facing APIs.

## Stay in `v1` When

- Adding optional request fields
- Adding optional response fields
- Adding new endpoints or resources
- Expanding enums where existing consumers can safely ignore new values
- Improving validation without rejecting payloads that were previously valid

## Introduce `v2` When

- A required request field changes meaning or becomes mandatory
- A response removes or renames fields consumed by the web app or workers
- Status/state-machine values change in a way that breaks existing assumptions
- Permission or auth behavior changes require different integration semantics
- An endpoint is split or merged and compatibility shims would create more risk than clarity

## Versioning Process

1. Confirm the change is truly breaking.
2. Document the affected consumers.
3. Add the new controller route under `/v2/...`.
4. Keep `/v1/...` functional during the migration window.
5. Update frontend or worker consumers intentionally, not opportunistically.
6. Announce deprecation in the PR summary and relevant docs.

## Compatibility Expectations

- Shared Zod schemas remain the source of truth for request and response contracts.
- Existing clients should continue to work until the migration plan is complete.
- If both versions coexist, tests must cover the old and new behavior separately.

## Review Checklist for Breaking API Work

- What existing callers break?
- Can this be additive instead?
- Is there a compatibility shim that is safer than versioning?
- Have the architecture docs and blast-radius notes been updated?
- Is the deprecation and migration path clear in the PR?
