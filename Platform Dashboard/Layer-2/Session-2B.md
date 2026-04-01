# Session 2B -- Multi-Channel Alerting

**Depends on:** Session 2A (configurable alert rules engine with `condition_config` and per-rule channel assignment model)
**Blocks:** Nothing within Layer 2

---

## 1. Objective

Add Telegram, WhatsApp, and browser push notification channels alongside the existing email dispatch from Layer 1C. Each alert rule can be routed to one or more channels. The system uses a strategy pattern so new channel types can be added later without modifying core dispatch logic.

**Channel types:**

- **Email** -- Resend API (already exists from 1C -- formalize into the channel abstraction)
- **Telegram** -- Bot API HTTP calls to send messages to a chat
- **WhatsApp** -- Twilio API (existing infrastructure from communications module)
- **Browser Push** -- Web Push API with VAPID keys

---

## 2. Database Changes

### 2.1 New Enum: `PlatformAlertChannelType`

```prisma
enum PlatformAlertChannelType {
  email
  telegram
  whatsapp
  push
}
```

### 2.2 New Table: `platform_alert_channels`

```prisma
model PlatformAlertChannel {
  id         String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name       String                   @db.VarChar(255)
  type       PlatformAlertChannelType
  config     Json                     @db.JsonB
  is_enabled Boolean                  @default(true)
  created_at DateTime                 @default(now()) @db.Timestamptz()
  updated_at DateTime                 @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  rule_channels PlatformAlertRuleChannel[]

  @@map("platform_alert_channels")
}
```

**NO `tenant_id`. NO RLS.** This is a platform-level table.

### 2.3 `config` JSONB Shapes Per Channel Type

```typescript
// Email
interface EmailChannelConfig {
  recipients: string[]; // array of email addresses
}

// Telegram
interface TelegramChannelConfig {
  bot_token: string; // encrypted at rest
  chat_id: string; // Telegram chat/group ID
}

// WhatsApp
interface WhatsAppChannelConfig {
  to_number: string; // E.164 format, e.g., "+353861234567"
  // Uses existing Twilio infrastructure -- account_sid and auth_token from env vars
}

// Browser Push
interface PushChannelConfig {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
```

### 2.4 New Table: `platform_alert_rule_channels` (Join Table)

```prisma
model PlatformAlertRuleChannel {
  rule_id    String @db.Uuid
  channel_id String @db.Uuid

  rule    PlatformAlertRule    @relation(fields: [rule_id], references: [id], onDelete: Cascade)
  channel PlatformAlertChannel @relation(fields: [channel_id], references: [id], onDelete: Cascade)

  @@id([rule_id, channel_id])
  @@map("platform_alert_rule_channels")
}
```

### 2.5 Migration

**File:** `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_alert_channels/migration.sql`

```sql
-- Create channel type enum
CREATE TYPE "PlatformAlertChannelType" AS ENUM ('email', 'telegram', 'whatsapp', 'push');

-- Create channels table
CREATE TABLE "platform_alert_channels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "type" "PlatformAlertChannelType" NOT NULL,
  "config" JSONB NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_alert_channels_pkey" PRIMARY KEY ("id")
);

-- Create rule-channel join table
CREATE TABLE "platform_alert_rule_channels" (
  "rule_id" UUID NOT NULL,
  "channel_id" UUID NOT NULL,
  CONSTRAINT "platform_alert_rule_channels_pkey" PRIMARY KEY ("rule_id", "channel_id"),
  CONSTRAINT "platform_alert_rule_channels_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "platform_alert_rules"("id") ON DELETE CASCADE,
  CONSTRAINT "platform_alert_rule_channels_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "platform_alert_channels"("id") ON DELETE CASCADE
);

-- Index for reverse lookup (channel -> rules)
CREATE INDEX "idx_platform_alert_rule_channels_channel" ON "platform_alert_rule_channels"("channel_id");
```

**No RLS policies.** Platform-level tables.

---

## 3. Backend Changes

### 3.1 Shared Schemas

**File:** `packages/shared/src/schemas/platform-admin.schema.ts` (extend from 2A)

```typescript
// ─── Channel Config Schemas (per type) ────────────────────────────────────────

const ALERT_CHANNEL_TYPES = ['email', 'telegram', 'whatsapp', 'push'] as const;

const emailChannelConfigSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(10),
});

const telegramChannelConfigSchema = z.object({
  bot_token: z.string().min(1),
  chat_id: z.string().min(1),
});

const whatsappChannelConfigSchema = z.object({
  to_number: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Must be E.164 format'),
});

const pushChannelConfigSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// ─── Channel CRUD Schemas ─────────────────────────────────────────────────────

export const createAlertChannelSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    name: z.string().min(1).max(255),
    config: emailChannelConfigSchema,
    is_enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('telegram'),
    name: z.string().min(1).max(255),
    config: telegramChannelConfigSchema,
    is_enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('whatsapp'),
    name: z.string().min(1).max(255),
    config: whatsappChannelConfigSchema,
    is_enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('push'),
    name: z.string().min(1).max(255),
    config: pushChannelConfigSchema,
    is_enabled: z.boolean().default(true),
  }),
]);

export type CreateAlertChannelDto = z.infer<typeof createAlertChannelSchema>;

export const updateAlertChannelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(), // validated per-type in service
  is_enabled: z.boolean().optional(),
});

export type UpdateAlertChannelDto = z.infer<typeof updateAlertChannelSchema>;

export { ALERT_CHANNEL_TYPES };
```

### 3.2 DTO Re-exports

**File:** `apps/api/src/modules/platform-admin/dto/alert-channel.dto.ts`

```typescript
import type { CreateAlertChannelDto, UpdateAlertChannelDto } from '@school/shared';

export type { CreateAlertChannelDto, UpdateAlertChannelDto };
```

### 3.3 Alert Channels Controller

**File:** `apps/api/src/modules/platform-admin/alert-channels.controller.ts`

```typescript
@Controller('v1/admin/alerts/channels')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class AlertChannelsController {
  constructor(private readonly channelsService: AlertChannelsService) {}

  // GET /v1/admin/alerts/channels
  @Get()
  async listChannels(): Promise<PlatformAlertChannel[]> { ... }

  // POST /v1/admin/alerts/channels
  @Post()
  async createChannel(
    @Body(new ZodValidationPipe(createAlertChannelSchema)) dto: CreateAlertChannelDto,
  ): Promise<PlatformAlertChannel> { ... }

  // PATCH /v1/admin/alerts/channels/:id
  @Patch(':id')
  async updateChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAlertChannelSchema)) dto: UpdateAlertChannelDto,
  ): Promise<PlatformAlertChannel> { ... }

  // DELETE /v1/admin/alerts/channels/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChannel(@Param('id', ParseUUIDPipe) id: string): Promise<void> { ... }

  // POST /v1/admin/alerts/channels/:id/test
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async testChannel(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string }> { ... }
}
```

### 3.4 Alert Channels Service

**File:** `apps/api/src/modules/platform-admin/alert-channels.service.ts`

```typescript
@Injectable()
export class AlertChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchService: ChannelDispatchService,
  ) {}

  async listChannels(): Promise<PlatformAlertChannel[]> {
    return this.prisma.platformAlertChannel.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async createChannel(dto: CreateAlertChannelDto): Promise<PlatformAlertChannel> {
    // For Telegram: encrypt bot_token before storing
    const config = this.prepareConfig(dto.type, dto.config);

    return this.prisma.platformAlertChannel.create({
      data: {
        name: dto.name,
        type: dto.type,
        config,
        is_enabled: dto.is_enabled ?? true,
      },
    });
  }

  async updateChannel(id: string, dto: UpdateAlertChannelDto): Promise<PlatformAlertChannel> {
    const existing = await this.findOrThrow(id);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.is_enabled !== undefined) data.is_enabled = dto.is_enabled;
    if (dto.config !== undefined) {
      // Validate config against channel type
      data.config = this.prepareConfig(existing.type, dto.config);
    }

    return this.prisma.platformAlertChannel.update({
      where: { id },
      data,
    });
  }

  async deleteChannel(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.platformAlertChannel.delete({ where: { id } });
  }

  async testChannel(id: string): Promise<{ success: boolean; message: string }> {
    const channel = await this.findOrThrow(id);
    return this.dispatchService.sendTestAlert(channel);
  }

  private async findOrThrow(id: string): Promise<PlatformAlertChannel> {
    const channel = await this.prisma.platformAlertChannel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException({
        code: 'CHANNEL_NOT_FOUND',
        message: `Alert channel with id "${id}" not found`,
      });
    }
    return channel;
  }

  private prepareConfig(type: string, config: Record<string, unknown>): Record<string, unknown> {
    // Encrypt sensitive fields (bot_token for Telegram)
    // Validate shape against channel type
    return config;
  }
}
```

### 3.5 Channel Dispatch Service (Strategy Pattern)

**File:** `apps/api/src/modules/platform-admin/channel-dispatch.service.ts`

This is the core dispatch orchestrator. It holds a map of channel dispatchers and delegates to the correct one based on channel type.

```typescript
@Injectable()
export class ChannelDispatchService {
  private readonly dispatchers: Map<string, ChannelDispatcher>;

  constructor(
    private readonly emailDispatcher: EmailAlertDispatcher,
    private readonly telegramDispatcher: TelegramAlertDispatcher,
    private readonly whatsappDispatcher: WhatsAppAlertDispatcher,
    private readonly pushDispatcher: PushAlertDispatcher,
  ) {
    this.dispatchers = new Map<string, ChannelDispatcher>([
      ['email', this.emailDispatcher],
      ['telegram', this.telegramDispatcher],
      ['whatsapp', this.whatsappDispatcher],
      ['push', this.pushDispatcher],
    ]);
  }

  async dispatchAlert(
    alert: { rule_name: string; severity: string; message: string; metric_value: number },
    channels: PlatformAlertChannel[],
  ): Promise<string[]> {
    const notified: string[] = [];
    for (const channel of channels) {
      if (!channel.is_enabled) continue;
      const dispatcher = this.dispatchers.get(channel.type);
      if (!dispatcher) continue;
      try {
        await dispatcher.send(channel.config, alert);
        notified.push(channel.type);
      } catch (err) {
        console.error(`[ChannelDispatchService] Failed to dispatch to ${channel.type}:`, err);
      }
    }
    return notified;
  }

  async sendTestAlert(
    channel: PlatformAlertChannel,
  ): Promise<{ success: boolean; message: string }> {
    const dispatcher = this.dispatchers.get(channel.type);
    if (!dispatcher) {
      return { success: false, message: `Unknown channel type: ${channel.type}` };
    }
    try {
      await dispatcher.send(channel.config, {
        rule_name: 'Test Alert',
        severity: 'info',
        message: 'This is a test alert from EduPod Platform Admin.',
        metric_value: 0,
      });
      return { success: true, message: `Test alert sent to ${channel.type} successfully` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message: `Failed to send test alert: ${msg}` };
    }
  }
}
```

### 3.6 Channel Dispatcher Interface

**File:** `apps/api/src/modules/platform-admin/dispatchers/channel-dispatcher.interface.ts`

```typescript
export interface AlertPayload {
  rule_name: string;
  severity: string;
  message: string;
  metric_value: number;
}

export interface ChannelDispatcher {
  send(config: Record<string, unknown>, alert: AlertPayload): Promise<void>;
}
```

### 3.7 Email Dispatcher

**File:** `apps/api/src/modules/platform-admin/dispatchers/email-alert.dispatcher.ts`

Wraps the existing Resend/email service from Layer 1C into the `ChannelDispatcher` interface.

```typescript
@Injectable()
export class EmailAlertDispatcher implements ChannelDispatcher {
  constructor(private readonly configService: ConfigService) {}

  async send(config: Record<string, unknown>, alert: AlertPayload): Promise<void> {
    const recipients = (config as { recipients: string[] }).recipients;
    // Use Resend API to send alert email
    // Subject: `[${alert.severity.toUpperCase()}] ${alert.rule_name}`
    // Body: alert.message + metric_value
  }
}
```

### 3.8 Telegram Dispatcher

**File:** `apps/api/src/modules/platform-admin/dispatchers/telegram-alert.dispatcher.ts`

```typescript
@Injectable()
export class TelegramAlertDispatcher implements ChannelDispatcher {
  private readonly logger = new Logger(TelegramAlertDispatcher.name);

  async send(config: Record<string, unknown>, alert: AlertPayload): Promise<void> {
    const { bot_token, chat_id } = config as { bot_token: string; chat_id: string };
    // Decrypt bot_token if encrypted
    const decryptedToken = this.decryptToken(bot_token);

    const severityEmoji =
      {
        info: 'ℹ️',
        warning: '⚠️',
        critical: '🔴',
      }[alert.severity] ?? '📢';

    const text = [
      `${severityEmoji} *${this.escapeMarkdown(alert.rule_name)}*`,
      ``,
      this.escapeMarkdown(alert.message),
      ``,
      `Metric value: \`${alert.metric_value}\``,
      `Severity: ${alert.severity}`,
    ].join('\n');

    const url = `https://api.telegram.org/bot${decryptedToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text,
        parse_mode: 'MarkdownV2',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API error ${response.status}: ${body}`);
    }
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }

  private decryptToken(token: string): string {
    // If token is encrypted (starts with enc: prefix), decrypt it
    // Otherwise return as-is (for test/dev environments)
    return token;
  }
}
```

### 3.9 WhatsApp Dispatcher

**File:** `apps/api/src/modules/platform-admin/dispatchers/whatsapp-alert.dispatcher.ts`

```typescript
@Injectable()
export class WhatsAppAlertDispatcher implements ChannelDispatcher {
  private readonly logger = new Logger(WhatsAppAlertDispatcher.name);

  constructor(private readonly configService: ConfigService) {}

  async send(config: Record<string, unknown>, alert: AlertPayload): Promise<void> {
    const { to_number } = config as { to_number: string };
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_FROM');

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const body = [
      `[${alert.severity.toUpperCase()}] ${alert.rule_name}`,
      '',
      alert.message,
      '',
      `Metric value: ${alert.metric_value}`,
    ].join('\n');

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        From: `whatsapp:${fromNumber}`,
        To: `whatsapp:${to_number}`,
        Body: body,
      }).toString(),
    });

    if (!response.ok) {
      const respBody = await response.text();
      throw new Error(`Twilio API error ${response.status}: ${respBody}`);
    }
  }
}
```

### 3.10 Browser Push Dispatcher

**File:** `apps/api/src/modules/platform-admin/dispatchers/push-alert.dispatcher.ts`

```typescript
@Injectable()
export class PushAlertDispatcher implements ChannelDispatcher {
  private readonly logger = new Logger(PushAlertDispatcher.name);

  constructor(private readonly configService: ConfigService) {}

  async send(config: Record<string, unknown>, alert: AlertPayload): Promise<void> {
    const pushConfig = config as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    const vapidPublicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const vapidEmail = this.configService.get<string>('VAPID_EMAIL', 'mailto:admin@edupod.app');

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys not configured');
    }

    // Use web-push library (npm: web-push)
    const webpush = await import('web-push');
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title: `[${alert.severity.toUpperCase()}] ${alert.rule_name}`,
      body: alert.message,
      data: { metric_value: alert.metric_value },
      icon: '/icon-192.png',
      badge: '/badge-72.png',
    });

    await webpush.sendNotification(
      {
        endpoint: pushConfig.endpoint,
        keys: pushConfig.keys,
      },
      payload,
    );
  }
}
```

### 3.11 Update Alert Evaluation Service

**File:** `apps/api/src/modules/platform-admin/alert-evaluation.service.ts` (modify from 2A)

After evaluating a rule and deciding to fire, the evaluation service must:

1. Look up the rule's channels via `platform_alert_rule_channels` join table
2. Fetch the full channel records
3. Call `ChannelDispatchService.dispatchAlert(alert, channels)`
4. Record which channels were notified in `platform_alert_history.channels_notified`

```typescript
// In the fire() method:
private async fireAlert(rule: PlatformAlertRule, currentValue: number): Promise<void> {
  // Get channels for this rule
  const ruleChannels = await this.prisma.platformAlertRuleChannel.findMany({
    where: { rule_id: rule.id },
    include: { channel: true },
  });

  const channels = ruleChannels.map(rc => rc.channel);
  const message = this.buildAlertMessage(rule, currentValue);

  // Dispatch to all configured channels
  const notified = await this.dispatchService.dispatchAlert(
    {
      rule_name: rule.name,
      severity: rule.severity,
      message,
      metric_value: currentValue,
    },
    channels,
  );

  // Record in history
  await this.prisma.platformAlertHistory.create({
    data: {
      rule_id: rule.id,
      severity: rule.severity,
      message,
      metric_value: currentValue,
      channels_notified: notified,
      status: 'fired',
      fired_at: new Date(),
    },
  });

  // Publish to WebSocket
  await this.redis.getClient().publish('platform:alerts', JSON.stringify({
    type: 'alert_fired',
    rule_id: rule.id,
    rule_name: rule.name,
    severity: rule.severity,
    message,
    metric_value: currentValue,
    channels_notified: notified,
    fired_at: new Date().toISOString(),
  }));
}
```

---

## 4. Frontend Changes

### 4.1 Channel Configuration Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/alerts/channels/page.tsx`

Page structure:

1. **PageHeader** -- "Alert Channels" with "Add Channel" button
2. **Channel cards** -- one card per configured channel, showing:
   - Channel name
   - Channel type icon and label (Email, Telegram, WhatsApp, Push)
   - Enabled/disabled status toggle
   - Config summary (e.g., "2 recipients" for email, "Chat: -1001234567" for Telegram)
   - **Test** button -- sends a test alert and shows success/failure toast
   - **Edit** / **Delete** buttons

### 4.2 Create/Edit Channel Dialog

**File:** `apps/web/src/app/[locale]/(platform)/admin/alerts/channels/_components/channel-form-dialog.tsx`

The dialog changes its config fields based on the selected channel type:

```
Channel Name     [_________________________]

Channel Type     [v Email                  ]
                    Telegram
                    WhatsApp
                    Browser Push

--- TYPE-SPECIFIC FIELDS ---

EMAIL:
  Recipients     [user@example.com        ]  (tag input, add multiple)

TELEGRAM:
  Bot Token      [_________________________]  (password field)
  Chat ID        [_________________________]  (text field)
  Hint: "Send /start to your bot, then use @userinfobot to find your chat ID"

WHATSAPP:
  Phone Number   [+353_______________]  (E.164 format)

PUSH:
  [Request Permission]  button that triggers browser push permission flow
  Status: "Permission granted" / "Permission denied" / "Not supported"

[Cancel]  [Save Channel]
```

The form uses `react-hook-form` with the discriminated union schema. The type selector controls which config sub-form renders.

### 4.3 Browser Push Registration Helper

**File:** `apps/web/src/app/[locale]/(platform)/admin/alerts/channels/_components/push-subscription.tsx`

A client-side component that:

1. Checks `'serviceWorker' in navigator && 'PushManager' in window`
2. Requests notification permission: `Notification.requestPermission()`
3. Registers a service worker and subscribes to push: `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey })`
4. Extracts `endpoint`, `keys.p256dh`, `keys.auth` from the subscription
5. Passes these values back to the channel form

### 4.4 Service Worker for Push Notifications

**File:** `apps/web/public/sw-push.js`

Minimal service worker that handles push events:

```javascript
self.addEventListener('push', function (event) {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'EduPod Alert', {
      body: data.body ?? '',
      icon: data.icon ?? '/icon-192.png',
      badge: data.badge ?? '/badge-72.png',
      data: data.data ?? {},
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/en/admin/alerts'));
});
```

### 4.5 Update Rule Form (from 2A)

**File:** `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/_components/rule-form-dialog.tsx` (modify)

Now that channels exist, the channel checkboxes in the rule form become functional:

- Fetch channels via `GET /v1/admin/alerts/channels`
- Show a checkbox per enabled channel
- Selected channel IDs are sent as `channel_ids` in the create/update payload

---

## 5. Files to Create

| #   | File Path                                                                                        | Purpose                                |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1   | `apps/api/src/modules/platform-admin/alert-channels.controller.ts`                               | Channel CRUD + test endpoint           |
| 2   | `apps/api/src/modules/platform-admin/alert-channels.controller.spec.ts`                          | Controller unit tests                  |
| 3   | `apps/api/src/modules/platform-admin/alert-channels.service.ts`                                  | Channel business logic                 |
| 4   | `apps/api/src/modules/platform-admin/alert-channels.service.spec.ts`                             | Service unit tests                     |
| 5   | `apps/api/src/modules/platform-admin/channel-dispatch.service.ts`                                | Strategy pattern dispatch orchestrator |
| 6   | `apps/api/src/modules/platform-admin/channel-dispatch.service.spec.ts`                           | Dispatch service unit tests            |
| 7   | `apps/api/src/modules/platform-admin/dispatchers/channel-dispatcher.interface.ts`                | Dispatcher interface                   |
| 8   | `apps/api/src/modules/platform-admin/dispatchers/email-alert.dispatcher.ts`                      | Email dispatcher                       |
| 9   | `apps/api/src/modules/platform-admin/dispatchers/email-alert.dispatcher.spec.ts`                 | Email dispatcher tests                 |
| 10  | `apps/api/src/modules/platform-admin/dispatchers/telegram-alert.dispatcher.ts`                   | Telegram bot API dispatcher            |
| 11  | `apps/api/src/modules/platform-admin/dispatchers/telegram-alert.dispatcher.spec.ts`              | Telegram dispatcher tests              |
| 12  | `apps/api/src/modules/platform-admin/dispatchers/whatsapp-alert.dispatcher.ts`                   | WhatsApp/Twilio dispatcher             |
| 13  | `apps/api/src/modules/platform-admin/dispatchers/whatsapp-alert.dispatcher.spec.ts`              | WhatsApp dispatcher tests              |
| 14  | `apps/api/src/modules/platform-admin/dispatchers/push-alert.dispatcher.ts`                       | Web Push dispatcher                    |
| 15  | `apps/api/src/modules/platform-admin/dispatchers/push-alert.dispatcher.spec.ts`                  | Push dispatcher tests                  |
| 16  | `apps/api/src/modules/platform-admin/dto/alert-channel.dto.ts`                                   | DTO re-exports                         |
| 17  | `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_alert_channels/migration.sql`            | DB migration                           |
| 18  | `apps/web/src/app/[locale]/(platform)/admin/alerts/channels/page.tsx`                            | Channel configuration page             |
| 19  | `apps/web/src/app/[locale]/(platform)/admin/alerts/channels/_components/channel-form-dialog.tsx` | Create/edit channel dialog             |
| 20  | `apps/web/src/app/[locale]/(platform)/admin/alerts/channels/_components/push-subscription.tsx`   | Push notification registration         |
| 21  | `apps/web/public/sw-push.js`                                                                     | Service worker for push notifications  |

## 6. Files to Modify

| #   | File Path                                                                                  | Change                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/prisma/schema.prisma`                                                            | Add `PlatformAlertChannelType` enum, `PlatformAlertChannel` model, `PlatformAlertRuleChannel` model, add `channels` relation to `PlatformAlertRule` |
| 2   | `packages/shared/src/schemas/platform-admin.schema.ts`                                     | Add channel schemas                                                                                                                                 |
| 3   | `packages/shared/src/index.ts`                                                             | Export new channel schemas and types                                                                                                                |
| 4   | `apps/api/src/modules/platform-admin/platform-admin.module.ts`                             | Register channel controller, service, dispatch service, all dispatchers                                                                             |
| 5   | `apps/api/src/modules/platform-admin/alert-evaluation.service.ts`                          | Integrate `ChannelDispatchService` for multi-channel dispatch on alert fire                                                                         |
| 6   | `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/_components/rule-form-dialog.tsx` | Activate channel checkboxes (fetch channels, send channel_ids)                                                                                      |
| 7   | `apps/web/src/app/[locale]/(platform)/layout.tsx`                                          | Add "Channel Config" to sidebar under Settings                                                                                                      |

---

## 7. Testing Strategy

### Unit Tests -- `alert-channels.service.spec.ts`

```typescript
describe('AlertChannelsService', () => {
  describe('createChannel', () => {
    it('should create an email channel with valid recipients');
    it('should create a telegram channel with bot_token and chat_id');
    it('should create a whatsapp channel with E.164 number');
    it('should create a push channel with valid subscription');
    it('should reject email channel with empty recipients array');
    it('should reject whatsapp channel with invalid phone format');
  });

  describe('updateChannel', () => {
    it('should update channel name');
    it('should update channel config');
    it('should throw NotFoundException for non-existent channel');
  });

  describe('deleteChannel', () => {
    it('should delete channel and cascade rule-channel links');
    it('should throw NotFoundException for non-existent channel');
  });

  describe('testChannel', () => {
    it('should call dispatch service sendTestAlert');
    it('should return success: true on successful send');
    it('should return success: false on dispatch failure');
  });
});
```

### Unit Tests -- `channel-dispatch.service.spec.ts`

```typescript
describe('ChannelDispatchService', () => {
  describe('dispatchAlert', () => {
    it('should dispatch to all enabled channels');
    it('should skip disabled channels');
    it('should continue dispatching if one channel fails');
    it('should return list of successfully notified channel types');
  });
});
```

### Dispatcher Tests (per channel)

Each dispatcher gets tests for:

- Successful send (mock HTTP response)
- Error handling (4xx, 5xx responses)
- Missing credentials (throws descriptive error)

```typescript
describe('TelegramAlertDispatcher', () => {
  it('should call Telegram Bot API with correct payload');
  it('should escape MarkdownV2 special characters');
  it('should throw on non-OK response');
});

describe('WhatsAppAlertDispatcher', () => {
  it('should call Twilio API with correct payload');
  it('should throw when Twilio credentials are missing');
  it('should throw on non-OK response');
});

describe('PushAlertDispatcher', () => {
  it('should call web-push sendNotification with correct payload');
  it('should throw when VAPID keys are missing');
});
```

### Permission Tests

```typescript
it('should return 401 for unauthenticated channel requests');
it('should return 403 for non-platform-owner');
it('should allow platform-owner to CRUD channels');
```

---

## 8. Acceptance Criteria

- [ ] `platform_alert_channels` table created with migration
- [ ] `platform_alert_rule_channels` join table created with migration
- [ ] Channel CRUD endpoints work for all 4 types (email, telegram, whatsapp, push)
- [ ] Creating a channel validates type-specific config (email requires recipients, telegram requires bot_token + chat_id, etc.)
- [ ] Test alert endpoint sends to each channel type and returns success/failure
- [ ] Telegram dispatcher sends MarkdownV2 formatted message with severity emoji
- [ ] WhatsApp dispatcher sends via Twilio API with correct auth
- [ ] Push dispatcher sends via web-push with VAPID authentication
- [ ] Alert evaluation service dispatches to all channels linked to a rule
- [ ] Channels that fail dispatch do not prevent other channels from being notified
- [ ] `channels_notified` array in `platform_alert_history` records which channels were used
- [ ] Frontend channel configuration page lists all channels with type, status, and test button
- [ ] Create/edit dialog shows type-specific config fields
- [ ] Push subscription flow requests browser permission and extracts subscription data
- [ ] Rule form channel checkboxes are functional (link channels to rules)
- [ ] All dispatchers have unit tests with mocked HTTP calls
- [ ] `turbo lint` and `turbo type-check` pass with zero errors
