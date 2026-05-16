'use client';

import { BellRing, Edit2, Mail, MessageCircle, Plus, Send, Smartphone, Trash2 } from 'lucide-react';
import * as React from 'react';

import type { CreateAlertChannelDto, UpdateAlertChannelDto } from '@school/shared';
import { Button, Skeleton, Switch, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { ChannelFormDialog, type AlertChannel } from './_components/channel-form-dialog';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') {
      return maybeError.message;
    }
  }
  return fallback;
}

function configSummary(channel: AlertChannel): string {
  if ('recipients' in channel.config) {
    return `${channel.config.recipients.length} recipient${
      channel.config.recipients.length === 1 ? '' : 's'
    }`;
  }
  if ('chat_id' in channel.config) {
    return `Chat ${channel.config.chat_id}`;
  }
  if ('to_number' in channel.config) {
    return channel.config.to_number;
  }
  return new URL(channel.config.endpoint).hostname;
}

function ChannelIcon({ type }: { type: AlertChannel['type'] }) {
  if (type === 'email') return <Mail className="h-4 w-4" />;
  if (type === 'telegram') return <Send className="h-4 w-4" />;
  if (type === 'whatsapp') return <MessageCircle className="h-4 w-4" />;
  return <Smartphone className="h-4 w-4" />;
}

export default function PlatformAlertChannelsPage() {
  const [channels, setChannels] = React.useState<AlertChannel[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [formLoading, setFormLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [editingChannel, setEditingChannel] = React.useState<AlertChannel | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);

  const loadChannels = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<AlertChannel[]>('/api/v1/admin/alerts/channels');
      setChannels(result);
    } catch (err: unknown) {
      console.error('[PlatformAlertChannelsPage.loadChannels]', err);
      toast.error(getErrorMessage(err, 'Failed to load alert channels.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  function startCreate() {
    setEditingChannel(null);
    setOpen(true);
  }

  function startEdit(channel: AlertChannel) {
    setEditingChannel(channel);
    setOpen(true);
  }

  async function submitChannel(dto: CreateAlertChannelDto | UpdateAlertChannelDto) {
    try {
      setFormLoading(true);
      if (editingChannel) {
        const updated = await apiClient<AlertChannel>(
          `/api/v1/admin/alerts/channels/${editingChannel.id}`,
          { body: JSON.stringify(dto), method: 'PATCH' },
        );
        setChannels((current) =>
          current.map((channel) => (channel.id === updated.id ? updated : channel)),
        );
        toast.success('Alert channel updated.');
      } else {
        const created = await apiClient<AlertChannel>('/api/v1/admin/alerts/channels', {
          body: JSON.stringify(dto),
          method: 'POST',
        });
        setChannels((current) => [created, ...current]);
        toast.success('Alert channel created.');
      }
      setOpen(false);
      setEditingChannel(null);
    } catch (err: unknown) {
      console.error('[PlatformAlertChannelsPage.submitChannel]', err);
      toast.error(getErrorMessage(err, 'Failed to save alert channel.'));
    } finally {
      setFormLoading(false);
    }
  }

  async function toggleChannel(channel: AlertChannel, enabled: boolean) {
    try {
      const updated = await apiClient<AlertChannel>(`/api/v1/admin/alerts/channels/${channel.id}`, {
        body: JSON.stringify({ is_enabled: enabled }),
        method: 'PATCH',
      });
      setChannels((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err: unknown) {
      console.error('[PlatformAlertChannelsPage.toggleChannel]', err);
      toast.error(getErrorMessage(err, 'Failed to update alert channel.'));
    }
  }

  async function deleteChannel(channel: AlertChannel) {
    if (!window.confirm(`Delete alert channel "${channel.name}"?`)) {
      return;
    }

    try {
      await apiClient<void>(`/api/v1/admin/alerts/channels/${channel.id}`, { method: 'DELETE' });
      setChannels((current) => current.filter((item) => item.id !== channel.id));
      toast.success('Alert channel deleted.');
    } catch (err: unknown) {
      console.error('[PlatformAlertChannelsPage.deleteChannel]', err);
      toast.error(getErrorMessage(err, 'Failed to delete alert channel.'));
    }
  }

  async function testChannel(channel: AlertChannel) {
    try {
      setTestingId(channel.id);
      const result = await apiClient<{ success: boolean; message: string }>(
        `/api/v1/admin/alerts/channels/${channel.id}/test`,
        { method: 'POST' },
      );
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: unknown) {
      console.error('[PlatformAlertChannelsPage.testChannel]', err);
      toast.error(getErrorMessage(err, 'Failed to send test alert.'));
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Alert Channels</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Configure delivery targets for platform alert rules.
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="me-1.5 h-4 w-4" />
          Add channel
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[148px] rounded-lg" />
          ))}
        </div>
      ) : null}

      {!loading && channels.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
          <BellRing className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">No alert channels configured yet.</p>
        </div>
      ) : null}

      {!loading && channels.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-secondary">
                      <ChannelIcon type={channel.type} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-text-primary">
                        {channel.name}
                      </h2>
                      <p className="text-xs capitalize text-text-tertiary">{channel.type}</p>
                    </div>
                  </div>
                  <p className="mt-3 truncate text-sm text-text-secondary">
                    {configSummary(channel)}
                  </p>
                </div>
                <Switch
                  checked={channel.is_enabled}
                  onCheckedChange={(enabled) => void toggleChannel(channel, enabled)}
                  aria-label={channel.is_enabled ? 'Disable channel' : 'Enable channel'}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testingId === channel.id || !channel.is_enabled}
                  onClick={() => void testChannel(channel)}
                >
                  Test
                </Button>
                <Button size="icon" variant="ghost" onClick={() => startEdit(channel)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => void deleteChannel(channel)}>
                  <Trash2 className="h-4 w-4 text-danger-text" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <ChannelFormDialog
        initialData={editingChannel}
        loading={formLoading}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setEditingChannel(null);
          }
        }}
        onSubmit={submitChannel}
        open={open}
      />
    </div>
  );
}
