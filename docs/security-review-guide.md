# Security Review Guide

> **Purpose**: Define when a security design review is required, who conducts it, and what a reviewer is looking for. This guide expands on the checklist in `.github/PULL_REQUEST_TEMPLATE/security-review.md`.

---

## When Is a Security Review Required?

A security review is mandatory for any PR that touches the following domains:

| Domain                              | Trigger                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| **Finance**                         | `apps/api/src/modules/finance/`, fee structures, invoices, payments, credit notes  |
| **Payroll**                         | `apps/api/src/modules/payroll/`, payslips, payroll runs, deductions                |
| **GDPR**                            | Data subject requests, retention policies, consent records, audit exports          |
| **Auth / Sessions**                 | Login flows, JWT handling, refresh tokens, password changes, MFA                   |
| **Child protection / Safeguarding** | Incident records, welfare flags, safeguarding reports                              |
| **Tenant management**               | Tenant provisioning, settings, subscription gating, control-plane endpoints        |
| **Encryption**                      | Any use of `EncryptionService`, bank details, Stripe keys, third-party credentials |
| **Schema additions**                | Any new table that stores PII, health data, financial data, or credentials         |

A review is **not** required for:

- Bug fixes within non-sensitive modules
- UI-only changes with no backend impact
- Translation/i18n updates
- Test additions without new code paths

If you are unsure, treat it as required.

---

## How to Conduct a Security Review

Work through each section of the checklist in `.github/PULL_REQUEST_TEMPLATE/security-review.md`. The guidance below explains what to look for in each area.

---

### Data Protection

**No PII in logs**

Search the diff for `logger.log`, `logger.error`, `console.log`, `this.logger`, and Sentry `captureException` calls. Ensure none of them include student names, email addresses, medical data, financial amounts tied to an individual, or any field from the `users` table beyond the user's own `id`.

Acceptable in logs: operation IDs, tenant IDs, resource UUIDs, status transitions, error codes.
Not acceptable: names, emails, NI numbers, bank account details, health data.

**No excess PII in API responses**

Compare the response shape of new or modified endpoints against the stated purpose. An endpoint that lists students for a dropdown does not need to return address fields. Apply the minimum necessary principle: if the frontend does not need a field to render the page, do not return it.

**Encrypted fields**

Any field that stores a secret, credential, or sensitive financial identifier must be encrypted via `EncryptionService` (AES-256). Plaintext storage of these values is a breach. API responses must show at most the last four characters of encrypted values — never the full value. Verify that access to encrypted fields is captured by `AuditLogInterceptor`.

**DSAR traversal**

If the PR adds a new table that stores PII, the DSAR (Data Subject Access Request) export path must be updated to include that table. Check `apps/api/src/modules/gdpr/` for the traversal logic and add the new table.

---

### Tenant Isolation

**RLS on every new tenant-scoped table**

Every table that is not `users` must have:

```sql
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};
CREATE POLICY {table_name}_tenant_isolation ON {table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

This goes in `packages/prisma/rls/policies.sql` alongside its migration. Missing `FORCE ROW LEVEL SECURITY` is a silent failure — the policy exists but the table owner bypasses it. Do not omit it.

Run `pnpm audit:rls` to verify all tables in the schema have a corresponding policy.

**RLS leakage test**

Every new tenant-scoped API endpoint needs an RLS leakage test:

1. Create data as Tenant A.
2. Authenticate as Tenant B.
3. Attempt to read or query the data.
4. Assert: empty result or 404 — never Tenant A's data.

This test pattern is mandatory. See `.claude/rules/testing.md` for the full pattern.

**BullMQ job payloads**

Every job payload must include `tenant_id`. The `TenantAwareJob` base class uses this to set the RLS context before any DB operation. Jobs enqueued without `tenant_id` are rejected at enqueue time. Verify any new or modified job definitions include `tenant_id` in their Zod payload schema.

---

### Authentication & Authorization

**Guard stack**

Every controller class that handles tenant data must be decorated with:

```typescript
@UseGuards(AuthGuard, PermissionGuard)
```

If a specific endpoint is intentionally public (e.g., a health check), document the opt-out explicitly in the PR notes. Do not silently omit guards.

**Least privilege permissions**

New endpoints should require the narrowest permission that makes sense. A read endpoint does not need a `write` permission. A finance viewer should not be able to trigger payroll runs. Check `@RequiresPermission('domain.action')` on each route and verify the action segment reflects what the endpoint actually does.

**Password validation**

Any endpoint or form flow that accepts a password must enforce minimum length via Zod:

```typescript
z.string().min(8);
```

This applies to password creation, password reset, and password change flows.

**Secrets in URLs**

Session tokens, JWTs, API keys, and reset tokens must never appear in URL query parameters or path segments. They belong in request bodies (POST) or Authorization headers. URL parameters are logged by servers, proxies, and browser history.

---

### Input Validation

**Zod schemas on all inputs**

Every controller endpoint must validate its body, query, and param inputs. Bodies use `@Body(new ZodValidationPipe(schema))`. UUID path params use `@Param('id', ParseUUIDPipe)`. Schemas are defined in `packages/shared` and re-exported from the module's `dto/` folder.

There must be no unvalidated `any` input reaching the service layer.

**Raw SQL safety**

The ESLint rule `no-raw-sql-unsafe` prohibits `$executeRawUnsafe` and `$queryRawUnsafe` everywhere except the RLS middleware. If the diff contains either of these, the PR must be rejected regardless of other checks.

For the rare cases where a tagged template literal (`$queryRaw`) is used for safe parameterised queries, verify that no SQL identifiers (table names, column names) are interpolated from user input without a safe allowlist check.

---

### State Machine & Business Logic

**VALID_TRANSITIONS maps**

Status changes must be validated against the `VALID_TRANSITIONS` record map for that entity — not ad-hoc `if` checks. See `architecture/state-machines.md` for the full list of state machines. If the PR adds a new status value or a new transition path, both the code and `state-machines.md` must be updated.

**Approval callbacks**

Any operation that goes through an approval flow (invoice issuance, payroll finalisation, GDPR erasure) must track callback status via `callback_status`. This prevents double-processing if a worker job retries. Verify the callback field is updated atomically within the same RLS transaction as the state change.

**Irreversible operations**

Operations that cannot be undone — finalising a payroll run, voiding an invoice, erasing personal data — must require an explicit confirmation step in the UI and must document the irreversibility in the API response or a separate dry-run endpoint.

---

### Architecture

**Danger zones**

Before merging, open `architecture/danger-zones.md` and search for any entry that overlaps with the change area. If one exists, read the full entry and confirm the mitigation described there was followed.

**Blast radius**

If the PR introduces a new dependency between modules (one module's service being injected into another), update `architecture/module-blast-radius.md` to record it. Undocumented cross-module dependencies are how cascading failures happen silently.

**forwardRef()**

NestJS `forwardRef()` is a circular dependency workaround. Circular dependencies between modules indicate an architectural problem. Any new use of `forwardRef()` must be documented in the PR with: why the circular dependency exists, why it cannot be resolved by extracting a shared service, and what the risk is.

---

## Reviewer Sign-Off

The reviewer is responsible for working through each section above — not just scanning the diff. A rubber-stamp approval is not a security review.

When all items are checked (or explicitly marked N/A with justification), the reviewer approves the PR. The author is responsible for the accuracy of the N/A markings.

If any item cannot be resolved before merge, it must be filed as a tracked issue referencing this PR before the PR is approved.
