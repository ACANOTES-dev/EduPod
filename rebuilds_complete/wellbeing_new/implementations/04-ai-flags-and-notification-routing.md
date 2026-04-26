# Implementation 04 — AI Flag Service + Notification Routing

> **Wave:** 2 (parallel-safe — owns two new module directories)
> **Classification:** backend
> **Depends on:** 01
> **Deploys:** API + worker restart

---

## Goal

Two related services, both consumed heavily by Wave 3 backend impls:

1. **AI flag service** — reads `tenant_ai_flags`, exposes a `RequiresAiFlag(moduleKey)` decorator for any AI endpoint, exposes a CRUD for the upcoming admin UI (impl 18).
2. **Wellbeing notification routing** — maps wellbeing events (incident logged, concern raised, sanction served, SLA breached, etc.) to per-tenant channel preferences (in-app default-on + optional email/SMS/WhatsApp). Always writes in-app; provider stubs for the other three so Wave 3 services can call `dispatch()` without crashing.

## Shared files this impl touches

- `apps/api/src/app.module.ts` — register `AiFlagsModule` + `WellbeingNotificationsModule`. Edit late.
- `packages/shared/src/wellbeing/index.ts` — append the AI flag DTO schemas + notification event-key enum. Edit late.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **low.** The shared barrel is touched by impls 01, 03, 04, 05 — all serial-ish edits, deep-merge.

## What to build

### 1. AI flags module — `apps/api/src/modules/ai-flags/`

```
ai-flags/
├── ai-flags.controller.ts
├── ai-flags.controller.spec.ts
├── ai-flags.service.ts
├── ai-flags.service.spec.ts
├── ai-flags.module.ts
└── decorators/
    ├── requires-ai-flag.decorator.ts
    └── ai-flag.guard.ts
```

#### Controller

```ts
@Controller('v1/admin/ai-flags')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('ai_flag.manage')
export class AiFlagsController {
  constructor(private readonly service: AiFlagsService) {}

  // GET /v1/admin/ai-flags
  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list(tenant.tenant_id);
  }

  // PATCH /v1/admin/ai-flags/:moduleKey
  @Patch(':moduleKey')
  setFlag(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthUser,
    @Param('moduleKey') moduleKey: WellbeingAiModuleKey,
    @Body(new ZodValidationPipe(setAiFlagSchema)) body: SetAiFlagDto,
  ) {
    return this.service.setFlag(tenant.tenant_id, moduleKey, body.enabled, user.id);
  }
}
```

#### Service

- `list(tenantId)` → returns all 4 flag rows. If a row is missing for the tenant (shouldn't happen post-impl-01, but defensive), upsert with `enabled: false`.
- `setFlag(tenantId, moduleKey, enabled, byUserId)` → upsert with `updated_by = byUserId`, `updated_at = now()`. Audit-logged automatically by the existing `AuditLogInterceptor`.
- `isEnabled(tenantId, moduleKey)` → cached lookup (5-minute TTL via in-memory map keyed by `${tenantId}:${moduleKey}`). Used by the decorator. Cache invalidated on `setFlag`.

#### Decorator + Guard

```ts
// requires-ai-flag.decorator.ts
export const REQUIRES_AI_FLAG_KEY = 'requires_ai_flag';
export const RequiresAiFlag = (moduleKey: WellbeingAiModuleKey) =>
  SetMetadata(REQUIRES_AI_FLAG_KEY, moduleKey);

// ai-flag.guard.ts
@Injectable()
export class AiFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly aiFlags: AiFlagsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.get<WellbeingAiModuleKey>(
      REQUIRES_AI_FLAG_KEY,
      ctx.getHandler(),
    );
    if (!moduleKey) return true;
    const tenantId = ctx.switchToHttp().getRequest().tenantContext?.tenant_id;
    if (!tenantId) return false;
    const enabled = await this.aiFlags.isEnabled(tenantId, moduleKey);
    if (!enabled) {
      throw new ForbiddenException({
        code: 'AI_DISABLED',
        message: `AI features for ${moduleKey} are disabled for this tenant`,
      });
    }
    return true;
  }
}
```

The guard is registered globally via `APP_GUARD` in `AiFlagsModule` so any controller method using `@RequiresAiFlag('behaviour')` is gated. Wave 3 impls 05–09 add the decorator to existing AI endpoints.

### 2. Notification routing module — `apps/api/src/modules/wellbeing-notifications/`

```
wellbeing-notifications/
├── wellbeing-notifications.service.ts
├── wellbeing-notifications.service.spec.ts
├── wellbeing-notifications.module.ts
├── providers/
│   ├── in-app.provider.ts             # always implemented
│   ├── email.provider.ts              # stub — throws NotImplementedException with PROVIDER_NOT_WIRED
│   ├── sms.provider.ts                # stub
│   └── whatsapp.provider.ts           # stub
└── events/
    └── wellbeing-event-keys.ts        # the canonical enum/const
```

#### Event keys

```ts
export const WELLBEING_EVENT_KEYS = [
  'incident.logged',
  'incident.escalated',
  'incident.parent_meeting_scheduled',
  'concern.raised',
  'concern.acknowledged',
  'sanction.scheduled',
  'sanction.served',
  'sanction.no_show',
  'sla.breach',
  'critical.declared',
  'critical.acknowledged',
  'appeal.submitted',
  'appeal.decided',
  'recognition.awarded',
  'amendment.sent',
  'document.sent_to_parent',
  'break_glass.granted',
  'break_glass.expired',
] as const;
export type WellbeingEventKey = (typeof WELLBEING_EVENT_KEYS)[number];
```

#### Service

```ts
@Injectable()
export class WellbeingNotificationsService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly inApp: InAppProvider,
    private readonly email: EmailProvider,
    private readonly sms: SmsProvider,
    private readonly whatsapp: WhatsappProvider,
  ) {}

  async dispatch(input: {
    tenantId: string;
    event: WellbeingEventKey;
    recipients: Array<{ user_id: string; email?: string; phone?: string }>;
    title: string;
    body: string;
    href?: string;
    severity: 'info' | 'warning' | 'critical';
  }): Promise<void> {
    // 1. Always write in-app inbox rows (never gated)
    await this.inApp.send(input);

    // 2. Look up tenant preferences for this event
    const prefs = await this.getEventChannels(input.tenantId, input.event);

    // 3. Dispatch to each enabled extra channel; per-channel failure does not abort the others
    const out: Promise<unknown>[] = [];
    if (prefs.email) out.push(this.safeDispatch('email', () => this.email.send(input)));
    if (prefs.sms) out.push(this.safeDispatch('sms', () => this.sms.send(input)));
    if (prefs.whatsapp) out.push(this.safeDispatch('whatsapp', () => this.whatsapp.send(input)));
    await Promise.allSettled(out);
  }

  private async getEventChannels(tenantId: string, event: WellbeingEventKey) {
    const row = await this.prisma.tenantNotificationPreferences.findUnique({
      where: { tenant_id: tenantId },
    });
    const prefs = wellbeingChannelPreferencesSchema.parse(
      row?.wellbeing_channels ?? {
        defaults: { email: false, sms: false, whatsapp: false },
        overrides: {},
      },
    );
    const override = prefs.overrides[event];
    return {
      email: override?.email ?? prefs.defaults.email,
      sms: override?.sms ?? prefs.defaults.sms,
      whatsapp: override?.whatsapp ?? prefs.defaults.whatsapp,
    };
  }

  private async safeDispatch(channel: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      if (
        err instanceof NotImplementedException &&
        (err.getResponse() as { code?: string })?.code === 'PROVIDER_NOT_WIRED'
      ) {
        // Expected during the rebuild — stubbed providers throw this
        return;
      }
      throw err;
    }
  }
}
```

#### Providers

- **InAppProvider** — writes a row to the existing inbox / messages table for each recipient. Use the existing inbox `MessagesService.deliverSystemMessage(...)` if it exists; investigate (`grep -r "deliverSystemMessage" apps/api/`). If it doesn't, add a minimal `system-channel` write that drops a row in `messages` table linked to the recipient's inbox. Coordinate with the inbox module's existing channel provider pattern (see `new-inbox/PLAN.md` §3 — InboxChannelProvider pattern).
- **EmailProvider / SmsProvider / WhatsappProvider** — stub:

```ts
@Injectable()
export class EmailProvider {
  send(input: WellbeingDispatchInput): Promise<void> {
    throw new NotImplementedException({
      code: 'PROVIDER_NOT_WIRED',
      message: 'Email provider for wellbeing channel is not yet wired',
    });
  }
}
```

Same shape for SMS and WhatsApp.

### 3. Module registration

Both modules registered in `app.module.ts`. Verify via the DI smoke test before pushing.

### 4. Shared types

Append to `packages/shared/src/wellbeing/index.ts`:

```ts
export const setAiFlagSchema = z.object({ enabled: z.boolean() });
export type SetAiFlagDto = z.infer<typeof setAiFlagSchema>;

export const WELLBEING_EVENT_KEYS = [...] as const; // duplicate of backend enum
export type WellbeingEventKey = (typeof WELLBEING_EVENT_KEYS)[number];
```

## Tests

- `ai-flags.service.spec.ts` — list, setFlag with audit byUserId, isEnabled cached + invalidated on setFlag.
- `ai-flags.controller.spec.ts` — happy + 403 without permission.
- `ai-flag.guard.spec.ts` — endpoint with `@RequiresAiFlag('behaviour')` returns 403 AI_DISABLED when flag off, passes when on.
- `wellbeing-notifications.service.spec.ts`:
  - In-app always called regardless of prefs
  - Email/SMS/WhatsApp called only when respective pref is true
  - Stub provider throwing `PROVIDER_NOT_WIRED` is silently swallowed
  - Real provider throwing other errors bubbles up
- RLS leakage test on `tenant_ai_flags` (Tenant B cannot see Tenant A's flag rows).

## Watch out for

- **In-app provider integration** — the existing inbox infrastructure may have constraints on system-message senders. Investigate; do not introduce a new bypass.
- **Cache invalidation in multi-instance deploys** — the in-memory cache in `AiFlagsService` is per-process. After `setFlag`, also publish a Redis pub/sub event `ai-flags:invalidated` and have each instance subscribe to flush its cache. If Redis pub/sub is too heavy for this rebuild, accept up to 5-minute staleness post-flip and document it.
- **Notification recipients resolution** — Wave 3 callers pass concrete user IDs. Resolution from "all parents of student X" or "all designated safeguarding leads" lives in each calling service, not here.
- **Audit log on `setFlag`** — `AuditLogInterceptor` should pick up the controller mutation. Verify by toggling a flag locally and inspecting the `audit_logs` table.

## Deployment notes

- Restart: API + worker (worker may need notifications module imported once Wave 3 jobs use it).
- Smoke:
  - `curl /api/v1/admin/ai-flags` returns 4 rows for tenant
  - `curl -X PATCH /api/v1/admin/ai-flags/behaviour -d '{"enabled": true}'` returns 200, then GET shows enabled
  - Pick any AI endpoint that doesn't yet have the decorator and verify base behaviour unchanged (Wave 3 wires the decorator)
