'use client';

import { Checkbox, Label, Switch, toast } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface NotificationSetting {
  id: string;
  notification_type: string;
  is_enabled: boolean;
  channels: string[];
}

const AVAILABLE_CHANNELS = ['email', 'sms', 'push'] as const;
type Channel = (typeof AVAILABLE_CHANNELS)[number];

/* -------------------------------------------------------------------------- */
/*  Notification type display names                                           */
/* -------------------------------------------------------------------------- */

const TYPE_LABEL_KEYS: Record<string, string> = {
  'invoice.issued': 'notifInvoiceIssued',
  'payment.received': 'notifPaymentReceived',
  'payment.failed': 'notifPaymentFailed',
  'report_card.published': 'notifReportCardPublished',
  'attendance.exception': 'notifAttendanceException',
  'admission.status_change': 'notifAdmissionStatusChange',
  'announcement.published': 'notifAnnouncementPublished',
  'approval.requested': 'notifApprovalRequested',
  'approval.decided': 'notifApprovalDecided',
  'inquiry.new_message': 'notifInquiryNewMessage',
  'payroll.finalised': 'notifPayrollFinalised',
  'payslip.generated': 'notifPayslipGenerated',
};

/* -------------------------------------------------------------------------- */
/*  Row component                                                             */
/* -------------------------------------------------------------------------- */

function NotificationRow({
  setting,
  onToggleEnabled,
  onToggleChannel,
  updating,
}: {
  setting: NotificationSetting;
  onToggleEnabled: (type: string, enabled: boolean) => void;
  onToggleChannel: (type: string, channel: Channel, checked: boolean) => void;
  updating: boolean;
}) {
  const t = useTranslations('settings');
  const labelKey = TYPE_LABEL_KEYS[setting.notification_type];
  const displayLabel = labelKey
    ? t(labelKey as Parameters<typeof t>[0])
    : setting.notification_type.replaceAll('.', ' ').replaceAll('_', ' ');

  return (
    <tr className="border-b border-border last:border-0">
      {/* Notification type */}
      <td className="py-3 pe-4 ps-6">
        <span className="text-sm text-text-primary">{displayLabel}</span>
        <p className="mt-0.5 font-mono text-xs text-text-tertiary">
          {setting.notification_type}
        </p>
      </td>

      {/* Enabled toggle */}
      <td className="py-3 pe-4">
        <Switch
          checked={setting.is_enabled}
          onCheckedChange={(checked) => onToggleEnabled(setting.notification_type, checked)}
          disabled={updating}
          aria-label={`${t('enable')} ${displayLabel}`}
        />
      </td>

      {/* Channel checkboxes */}
      {AVAILABLE_CHANNELS.map((channel) => {
        const channelLabelKey = `channel${channel.charAt(0).toUpperCase() + channel.slice(1)}` as Parameters<typeof t>[0];
        return (
          <td key={channel} className="py-3 pe-4 text-center">
            <div className="flex items-center justify-center">
              <Checkbox
                id={`${setting.notification_type}-${channel}`}
                checked={setting.channels.includes(channel)}
                onCheckedChange={(checked) =>
                  onToggleChannel(setting.notification_type, channel, checked === true)
                }
                disabled={updating || !setting.is_enabled}
                aria-label={`${displayLabel} ${t(channelLabelKey)}`}
              />
            </div>
          </td>
        );
      })}
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function NotificationsPage() {
  const t = useTranslations('settings');

  const [loading, setLoading] = React.useState(true);
  const [settings, setSettings] = React.useState<NotificationSetting[]>([]);
  const [updatingType, setUpdatingType] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchSettings() {
      try {
        const data = await apiClient<NotificationSetting[] | { data: NotificationSetting[] }>(
          '/api/v1/notification-settings',
        );
        const list = Array.isArray(data) ? data : data.data;
        setSettings(list);
      } catch {
        toast.error(t('loadFailed'));
      } finally {
        setLoading(false);
      }
    }
    void fetchSettings();
  }, [t]);

  async function patchSetting(type: string, updates: { is_enabled: boolean; channels: string[] }) {
    setUpdatingType(type);
    try {
      const updated = await apiClient<NotificationSetting>(
        `/api/v1/notification-settings/${encodeURIComponent(type)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
        },
      );
      setSettings((prev) =>
        prev.map((s) =>
          s.notification_type === type
            ? { ...s, is_enabled: updated.is_enabled, channels: updated.channels }
            : s,
        ),
      );
      toast.success(t('notifSettingUpdated'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('saveFailed'));
    } finally {
      setUpdatingType(null);
    }
  }

  function handleToggleEnabled(type: string, enabled: boolean) {
    const current = settings.find((s) => s.notification_type === type);
    if (!current) return;
    void patchSetting(type, { is_enabled: enabled, channels: current.channels });
  }

  function handleToggleChannel(type: string, channel: Channel, checked: boolean) {
    const current = settings.find((s) => s.notification_type === type);
    if (!current) return;

    const newChannels = checked
      ? [...new Set([...current.channels, channel])]
      : current.channels.filter((c) => c !== channel);

    void patchSetting(type, { is_enabled: current.is_enabled, channels: newChannels });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (settings.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-text-secondary">{t('notifNoSettings')}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary">{t('notifications')}</h2>
      <p className="mt-1 text-sm text-text-secondary">{t('notificationsDescription')}</p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-secondary">
              <th className="py-3 pe-4 ps-6 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('notifType')}
              </th>
              <th className="py-3 pe-4 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('enable')}
              </th>
              {AVAILABLE_CHANNELS.map((channel) => {
                const channelLabelKey = `channel${channel.charAt(0).toUpperCase() + channel.slice(1)}` as Parameters<typeof t>[0];
                return (
                  <th
                    key={channel}
                    className="py-3 pe-4 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                  >
                    <Label className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t(channelLabelKey)}
                    </Label>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {settings.map((setting) => (
              <NotificationRow
                key={setting.id}
                setting={setting}
                onToggleEnabled={handleToggleEnabled}
                onToggleChannel={handleToggleChannel}
                updating={updatingType === setting.notification_type}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-text-tertiary">{t('notifChannelsHint')}</p>
    </div>
  );
}
