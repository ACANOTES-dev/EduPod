'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  createAlertChannelSchema,
  type CreateAlertChannelDto,
  type UpdateAlertChannelDto,
} from '@school/shared';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Switch,
} from '@school/ui';

import { PushSubscription, type PushSubscriptionConfig } from './push-subscription';

export interface AlertChannel {
  id: string;
  name: string;
  type: 'email' | 'telegram' | 'whatsapp' | 'push';
  config:
    | { recipients: string[] }
    | { bot_token_mask: string; chat_id: string }
    | { to_number: string }
    | { endpoint: string; keys: { auth_mask: string; p256dh_mask: string } };
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ChannelFormDialogProps {
  initialData?: AlertChannel | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateAlertChannelDto | UpdateAlertChannelDto) => Promise<void>;
  open: boolean;
}

const channelFormSchema = z
  .object({
    email_recipients: z.string().optional(),
    is_enabled: z.boolean(),
    name: z.string().trim().min(1).max(255),
    push_auth: z.string().optional(),
    push_endpoint: z.string().optional(),
    push_p256dh: z.string().optional(),
    telegram_bot_token: z.string().optional(),
    telegram_chat_id: z.string().optional(),
    type: z.enum(['email', 'telegram', 'whatsapp', 'push']),
    whatsapp_to_number: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'email') {
      const emails = splitEmails(value.email_recipients ?? '');
      if (
        emails.length === 0 ||
        emails.some((email) => !z.string().email().safeParse(email).success)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter valid recipients',
          path: ['email_recipients'],
        });
      }
    }
    if (value.type === 'telegram' && !value.telegram_chat_id?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Chat ID is required',
        path: ['telegram_chat_id'],
      });
    }
    if (value.type === 'whatsapp' && !/^\+[1-9]\d{6,14}$/.test(value.whatsapp_to_number ?? '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use E.164 format',
        path: ['whatsapp_to_number'],
      });
    }
  });

type ChannelFormValues = z.infer<typeof channelFormSchema>;

function splitEmails(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function isEmailConfig(config: AlertChannel['config']): config is { recipients: string[] } {
  return 'recipients' in config;
}

function isTelegramConfig(
  config: AlertChannel['config'],
): config is { bot_token_mask: string; chat_id: string } {
  return 'chat_id' in config;
}

function isWhatsAppConfig(config: AlertChannel['config']): config is { to_number: string } {
  return 'to_number' in config;
}

function isPushConfig(
  config: AlertChannel['config'],
): config is { endpoint: string; keys: { auth_mask: string; p256dh_mask: string } } {
  return 'endpoint' in config;
}

function buildDefaults(initialData?: AlertChannel | null): ChannelFormValues {
  return {
    email_recipients:
      initialData && isEmailConfig(initialData.config)
        ? initialData.config.recipients.join(', ')
        : '',
    is_enabled: initialData?.is_enabled ?? true,
    name: initialData?.name ?? '',
    push_auth: '',
    push_endpoint:
      initialData && isPushConfig(initialData.config) ? initialData.config.endpoint : '',
    push_p256dh: '',
    telegram_bot_token: '',
    telegram_chat_id:
      initialData && isTelegramConfig(initialData.config) ? initialData.config.chat_id : '',
    type: initialData?.type ?? 'email',
    whatsapp_to_number:
      initialData && isWhatsAppConfig(initialData.config) ? initialData.config.to_number : '',
  };
}

export function ChannelFormDialog({
  initialData = null,
  loading,
  onOpenChange,
  onSubmit,
  open,
}: ChannelFormDialogProps) {
  const form = useForm<ChannelFormValues>({
    resolver: zodResolver(channelFormSchema),
    defaultValues: buildDefaults(initialData),
  });
  const type = form.watch('type');
  const isEditing = Boolean(initialData);

  React.useEffect(() => {
    form.reset(buildDefaults(initialData));
  }, [form, initialData]);

  async function submit(values: ChannelFormValues) {
    if (isEditing) {
      await onSubmit(buildUpdatePayload(values));
      return;
    }
    const parsed = createAlertChannelSchema.safeParse(buildCreatePayload(values));
    if (!parsed.success) {
      form.setError('root', { message: 'Check the channel details and try again.' });
      return;
    }
    await onSubmit(parsed.data);
  }

  function applyPushSubscription(config: PushSubscriptionConfig) {
    form.setValue('push_endpoint', config.endpoint, { shouldDirty: true, shouldValidate: true });
    form.setValue('push_auth', config.keys.auth, { shouldDirty: true, shouldValidate: true });
    form.setValue('push_p256dh', config.keys.p256dh, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pe-8">
          <SheetTitle>{initialData ? 'Edit Alert Channel' : 'Add Alert Channel'}</SheetTitle>
        </SheetHeader>
        <form className="mt-5 space-y-4" onSubmit={form.handleSubmit((v) => void submit(v))}>
          <div className="space-y-2">
            <Label htmlFor="channel-name">Channel name</Label>
            <Input id="channel-name" {...form.register('name')} />
          </div>

          <div className="space-y-2">
            <Label>Channel type</Label>
            {isEditing ? (
              <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm capitalize text-text-secondary">
                {type}
              </div>
            ) : (
              <Select
                value={type}
                onValueChange={(value) =>
                  form.setValue('type', value as ChannelFormValues['type'], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="push">Browser Push</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {type === 'email' ? (
            <div className="space-y-2">
              <Label htmlFor="channel-emails">Recipients</Label>
              <Input
                id="channel-emails"
                placeholder="ops@example.com, founder@example.com"
                {...form.register('email_recipients')}
              />
            </div>
          ) : null}

          {type === 'telegram' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="channel-telegram-token">Bot token</Label>
                <Input
                  id="channel-telegram-token"
                  type="password"
                  placeholder={isEditing ? 'Leave blank to keep token' : ''}
                  {...form.register('telegram_bot_token')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel-telegram-chat">Chat ID</Label>
                <Input id="channel-telegram-chat" {...form.register('telegram_chat_id')} />
              </div>
            </div>
          ) : null}

          {type === 'whatsapp' ? (
            <div className="space-y-2">
              <Label htmlFor="channel-whatsapp-number">Phone number</Label>
              <Input
                id="channel-whatsapp-number"
                placeholder="+353861234567"
                {...form.register('whatsapp_to_number')}
              />
            </div>
          ) : null}

          {type === 'push' ? (
            <div className="space-y-3">
              <PushSubscription onSubscription={applyPushSubscription} />
              <Input type="hidden" {...form.register('push_endpoint')} />
              <Input type="hidden" {...form.register('push_p256dh')} />
              <Input type="hidden" {...form.register('push_auth')} />
            </div>
          ) : null}

          {Object.values(form.formState.errors).length > 0 ? (
            <p className="text-sm text-danger-text">Check the channel details and try again.</p>
          ) : null}

          <div className="flex min-h-11 items-center justify-between rounded-lg border border-border px-3">
            <Label htmlFor="channel-enabled">Enabled</Label>
            <Switch
              id="channel-enabled"
              checked={form.watch('is_enabled')}
              onCheckedChange={(checked) =>
                form.setValue('is_enabled', checked, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {initialData ? 'Save channel' : 'Create channel'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function buildCreatePayload(values: ChannelFormValues): CreateAlertChannelDto {
  switch (values.type) {
    case 'email':
      return {
        config: { recipients: splitEmails(values.email_recipients ?? '') },
        is_enabled: values.is_enabled,
        name: values.name,
        type: 'email',
      };
    case 'push':
      return {
        config: {
          endpoint: values.push_endpoint ?? '',
          keys: { auth: values.push_auth ?? '', p256dh: values.push_p256dh ?? '' },
        },
        is_enabled: values.is_enabled,
        name: values.name,
        type: 'push',
      };
    case 'telegram':
      return {
        config: {
          bot_token: values.telegram_bot_token ?? '',
          chat_id: values.telegram_chat_id ?? '',
        },
        is_enabled: values.is_enabled,
        name: values.name,
        type: 'telegram',
      };
    case 'whatsapp':
      return {
        config: { to_number: values.whatsapp_to_number ?? '' },
        is_enabled: values.is_enabled,
        name: values.name,
        type: 'whatsapp',
      };
  }
}

function buildUpdatePayload(values: ChannelFormValues): UpdateAlertChannelDto {
  const payload: UpdateAlertChannelDto = {
    is_enabled: values.is_enabled,
    name: values.name,
  };

  if (values.type === 'email') {
    payload.config = { recipients: splitEmails(values.email_recipients ?? '') };
  }
  if (values.type === 'telegram') {
    payload.config = {
      ...(values.telegram_bot_token ? { bot_token: values.telegram_bot_token } : {}),
      ...(values.telegram_chat_id ? { chat_id: values.telegram_chat_id } : {}),
    };
  }
  if (values.type === 'whatsapp') {
    payload.config = { to_number: values.whatsapp_to_number ?? '' };
  }
  if (values.type === 'push' && values.push_endpoint && values.push_auth && values.push_p256dh) {
    payload.config = {
      endpoint: values.push_endpoint,
      keys: { auth: values.push_auth, p256dh: values.push_p256dh },
    };
  }

  return payload;
}
