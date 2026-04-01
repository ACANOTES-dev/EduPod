## Security Design Review

**Required for PRs touching**: finance, payroll, GDPR, auth, child-protection, safeguarding, tenant management

> If this PR does not touch any of those domains, delete this template and use the default PR description.
> If it does, every item below must be checked or explicitly marked N/A with a reason.

---

### Checklist

#### Data Protection

- [ ] No PII in logs (check structured logger output, error messages, Sentry context)
- [ ] No PII in API responses beyond what the endpoint requires
- [ ] Encrypted fields use `EncryptionService` — never store secrets/keys in plaintext
- [ ] DSAR traversal updated if new PII tables are added

#### Tenant Isolation

- [ ] New tables have `tenant_id`, RLS `ENABLE` + `FORCE`, canonical policy in `policies.sql`
- [ ] RLS audit script passes: `pnpm audit:rls`
- [ ] No cross-tenant data leakage (tested with RLS leakage test pattern)
- [ ] BullMQ jobs include `tenant_id` in payload

#### Authentication & Authorization

- [ ] Endpoints require `@UseGuards(AuthGuard, PermissionGuard)` or explicit opt-out documented here
- [ ] Permission checks match principle of least privilege
- [ ] Password-setting paths enforce `min(8)` via Zod schema
- [ ] No session tokens or secrets in URL parameters

#### Input Validation

- [ ] All inputs validated with Zod schemas
- [ ] UUID params use `ParseUUIDPipe`
- [ ] No `$executeRawUnsafe`/`$queryRawUnsafe` outside RLS middleware
- [ ] SQL identifiers validated against safe pattern before interpolation

#### State Machine & Business Logic

- [ ] Status transitions use `VALID_TRANSITIONS` maps
- [ ] Approval callbacks are tracked with `callback_status`
- [ ] Irreversible operations have confirmation/undo mechanisms

#### Architecture

- [ ] `architecture/danger-zones.md` checked for the change area
- [ ] `architecture/module-blast-radius.md` updated if new cross-module deps
- [ ] No new `forwardRef()` without documented justification

---

### Notes

_Describe any non-obvious security decisions, trade-offs, or deferred items._
