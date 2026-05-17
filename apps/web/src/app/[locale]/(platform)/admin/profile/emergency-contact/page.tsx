'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { updateEmergencyContactSchema, type UpdateEmergencyContactDto } from '@school/shared';
import { Button, Skeleton, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface EmergencyContact extends UpdateEmergencyContactDto {
  id?: string;
}

const PREFERRED_CHANNELS = ['email', 'push', 'sms', 'telegram', 'whatsapp'] as const;
type PreferredChannel = (typeof PREFERRED_CHANNELS)[number];

function isPreferredChannel(value: string): value is PreferredChannel {
  return PREFERRED_CHANNELS.includes(value as PreferredChannel);
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function PlatformEmergencyContactPage() {
  const [loading, setLoading] = React.useState(true);
  const form = useForm<UpdateEmergencyContactDto>({
    resolver: zodResolver(updateEmergencyContactSchema),
    defaultValues: {
      email: '',
      preferred_order: ['email'],
      push_subscription: null,
      sms_phone: '',
      telegram_chat_id: '',
      timezone: 'Europe/Dublin',
      whatsapp_phone: '',
    },
  });

  React.useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const contact = await apiClient<EmergencyContact>('/api/v1/admin/emergency-contacts/me');
        form.reset({
          email: contact.email ?? '',
          preferred_order: contact.preferred_order ?? ['email'],
          push_subscription: contact.push_subscription ?? null,
          sms_phone: contact.sms_phone ?? '',
          telegram_chat_id: contact.telegram_chat_id ?? '',
          timezone: contact.timezone ?? 'Europe/Dublin',
          whatsapp_phone: contact.whatsapp_phone ?? '',
        });
      } catch (err: unknown) {
        console.error('[PlatformEmergencyContactPage.load]', err);
        toast.error(getErrorMessage(err, 'Failed to load emergency contact.'));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [form]);

  async function save(dto: UpdateEmergencyContactDto) {
    try {
      await apiClient<EmergencyContact>('/api/v1/admin/emergency-contacts/me', {
        body: JSON.stringify(dto),
        method: 'PATCH',
      });
      toast.success('Emergency contact updated.');
    } catch (err: unknown) {
      console.error('[PlatformEmergencyContactPage.save]', err);
      toast.error(getErrorMessage(err, 'Failed to save emergency contact.'));
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Emergency Contact"
          description="Your platform alert acknowledgement profile."
        />
        <Skeleton className="h-[360px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Emergency Contact"
        description="Your operator destinations and timezone for acknowledgement links."
      />
      <form
        onSubmit={form.handleSubmit((dto) => void save(dto))}
        className="grid max-w-3xl gap-4 rounded-lg border border-border bg-surface p-4 md:grid-cols-2"
      >
        <label className="space-y-1">
          <span className="text-xs font-semibold text-text-secondary">Email</span>
          <input
            {...form.register('email')}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-text-secondary">Timezone</span>
          <input
            {...form.register('timezone')}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-text-secondary">SMS phone</span>
          <input
            {...form.register('sms_phone')}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-text-secondary">WhatsApp phone</span>
          <input
            {...form.register('whatsapp_phone')}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-text-secondary">Telegram chat id</span>
          <input
            {...form.register('telegram_chat_id')}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-text-secondary">Preferred order</span>
          <input
            value={form.watch('preferred_order')?.join(', ') ?? ''}
            onChange={(event) =>
              form.setValue(
                'preferred_order',
                event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(isPreferredChannel),
              )
            }
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          />
        </label>
        <div className="md:col-span-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            <Save className="me-1.5 h-4 w-4" />
            Save contact
          </Button>
        </div>
      </form>
    </div>
  );
}
