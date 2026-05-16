'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  ALERT_METRICS,
  ALERT_OPERATORS,
  ALERT_SEVERITIES,
  PLATFORM_ALERT_QUEUE_NAMES,
  createAlertRuleSchema,
  type CreateAlertRuleDto,
} from '@school/shared';
import {
  Button,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { PlatformAlertRule } from './alert-rule-list';

interface AlertRuleFormProps {
  initialData?: PlatformAlertRule | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (data: CreateAlertRuleDto) => void;
}

const COMPONENTS = ['postgresql', 'redis', 'meilisearch', 'bullmq', 'disk'] as const;
const METRIC_LABELS: Record<(typeof ALERT_METRICS)[number], string> = {
  api_latency_p95: 'API latency p95',
  disk_usage_percent: 'Disk usage percent',
  error_rate_5m: '5-minute error rate',
  health_status: 'Health component status',
  queue_depth: 'Queue depth',
  queue_failure_rate: 'Queue failure rate',
  stuck_jobs: 'Stuck jobs',
};

interface AlertChannelOption {
  id: string;
  name: string;
  type: 'email' | 'telegram' | 'whatsapp' | 'push';
  is_enabled: boolean;
}
const OPERATOR_LABELS: Record<(typeof ALERT_OPERATORS)[number], string> = {
  eq: 'Equal to',
  gt: 'Greater than',
  gte: 'Greater than or equal',
  lt: 'Less than',
  lte: 'Less than or equal',
};

function splitEmails(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function isPlatformAlertQueueName(
  value: string | undefined,
): value is NonNullable<CreateAlertRuleDto['condition_config']['queue']> {
  return PLATFORM_ALERT_QUEUE_NAMES.some((queueName) => queueName === value);
}

function buildDefaults(initialData?: PlatformAlertRule | null): CreateAlertRuleDto {
  const queue = isPlatformAlertQueueName(initialData?.condition_config.queue)
    ? initialData.condition_config.queue
    : undefined;

  return {
    name: initialData?.name ?? '',
    metric: initialData?.metric ?? 'health_status',
    condition_config: {
      component: initialData?.condition_config.component ?? 'postgresql',
      operator: initialData?.condition_config.operator ?? 'gt',
      threshold: initialData?.condition_config.threshold ?? 1,
      duration_minutes: initialData?.condition_config.duration_minutes,
      queue,
      tenant_id: initialData?.condition_config.tenant_id,
    },
    severity: initialData?.severity ?? 'warning',
    cooldown_minutes: initialData?.cooldown_minutes ?? 15,
    is_enabled: initialData?.is_enabled ?? true,
    is_security_critical: initialData?.is_security_critical ?? false,
    notify_emails: initialData?.notify_emails ?? [],
    channel_ids: initialData?.channel_ids ?? [],
  };
}

export function AlertRuleForm({
  initialData = null,
  loading,
  onCancel,
  onSubmit,
}: AlertRuleFormProps) {
  const [emailsInput, setEmailsInput] = React.useState(
    (initialData?.notify_emails ?? []).join(', '),
  );
  const [channels, setChannels] = React.useState<AlertChannelOption[]>([]);
  const [channelsLoading, setChannelsLoading] = React.useState(true);
  const form = useForm<CreateAlertRuleDto>({
    resolver: zodResolver(createAlertRuleSchema),
    defaultValues: buildDefaults(initialData),
  });

  const metric = form.watch('metric');
  const requiresComponent =
    metric === 'health_status' || metric === 'component_latency' || metric === 'component_status';
  const requiresQueue = metric === 'queue_depth' || metric === 'queue_failure_rate';
  const showsQueue = requiresQueue || metric === 'stuck_jobs';
  const showsTenant = metric === 'error_rate_5m';
  const errors = form.formState.errors;

  React.useEffect(() => {
    form.reset(buildDefaults(initialData));
    setEmailsInput((initialData?.notify_emails ?? []).join(', '));
  }, [form, initialData]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadChannels() {
      try {
        setChannelsLoading(true);
        const result = await apiClient<AlertChannelOption[]>('/api/v1/admin/alerts/channels', {
          silent: true,
        });
        if (!cancelled) {
          setChannels(result.filter((channel) => channel.is_enabled));
        }
      } catch (err: unknown) {
        console.error('[AlertRuleForm.loadChannels]', err);
      } finally {
        if (!cancelled) {
          setChannelsLoading(false);
        }
      }
    }

    void loadChannels();
    return () => {
      cancelled = true;
    };
  }, []);

  function submit(values: CreateAlertRuleDto) {
    const queue = showsQueue ? values.condition_config.queue : undefined;
    const tenantId = showsTenant ? values.condition_config.tenant_id : undefined;
    onSubmit({
      ...values,
      notify_emails: splitEmails(emailsInput),
      channel_ids: values.channel_ids,
      condition_config: {
        ...values.condition_config,
        component: requiresComponent ? values.condition_config.component : undefined,
        queue,
        tenant_id: tenantId === '' ? undefined : tenantId,
      },
    });
  }

  function toggleChannel(channelId: string, checked: boolean) {
    const selected = new Set(form.getValues('channel_ids'));
    if (checked) {
      selected.add(channelId);
    } else {
      selected.delete(channelId);
    }
    form.setValue('channel_ids', Array.from(selected), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return (
    <form
      className="rounded-lg border border-border bg-surface p-4"
      onSubmit={form.handleSubmit(submit)}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="alert-name">Name</Label>
          <Input id="alert-name" className="mt-1" {...form.register('name')} />
          {errors.name ? (
            <p className="mt-1 text-xs text-danger-text">{errors.name.message}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="alert-metric">Metric</Label>
          <Select
            value={metric}
            onValueChange={(value) => {
              form.setValue('metric', value as CreateAlertRuleDto['metric'], {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
          >
            <SelectTrigger id="alert-metric" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALERT_METRICS.map((metricKey) => (
                <SelectItem key={metricKey} value={metricKey}>
                  {METRIC_LABELS[metricKey]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {requiresComponent ? (
          <div>
            <Label htmlFor="alert-component">Component</Label>
            <Select
              value={form.watch('condition_config.component') ?? 'postgresql'}
              onValueChange={(value) => {
                form.setValue(
                  'condition_config.component',
                  value as NonNullable<CreateAlertRuleDto['condition_config']['component']>,
                  {
                    shouldDirty: true,
                    shouldValidate: true,
                  },
                );
              }}
            >
              <SelectTrigger id="alert-component" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPONENTS.map((component) => (
                  <SelectItem key={component} value={component}>
                    {component}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.condition_config?.component ? (
              <p className="mt-1 text-xs text-danger-text">
                {errors.condition_config.component.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {showsQueue ? (
          <div>
            <Label htmlFor="alert-queue">Queue{requiresQueue ? '' : ' (optional)'}</Label>
            <Select
              value={form.watch('condition_config.queue') ?? ''}
              onValueChange={(value) => {
                form.setValue(
                  'condition_config.queue',
                  value as NonNullable<CreateAlertRuleDto['condition_config']['queue']>,
                  {
                    shouldDirty: true,
                    shouldValidate: true,
                  },
                );
              }}
            >
              <SelectTrigger id="alert-queue" className="mt-1">
                <SelectValue placeholder={requiresQueue ? 'Select queue' : 'All queues'} />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_ALERT_QUEUE_NAMES.map((queueName) => (
                  <SelectItem key={queueName} value={queueName}>
                    {queueName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.condition_config?.queue ? (
              <p className="mt-1 text-xs text-danger-text">
                {errors.condition_config.queue.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {showsTenant ? (
          <div>
            <Label htmlFor="alert-tenant">Tenant UUID (optional)</Label>
            <Input
              id="alert-tenant"
              className="mt-1"
              placeholder="All tenants"
              {...form.register('condition_config.tenant_id', {
                setValueAs: (value) => (value === '' ? undefined : value),
              })}
            />
            {errors.condition_config?.tenant_id ? (
              <p className="mt-1 text-xs text-danger-text">
                {errors.condition_config.tenant_id.message}
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <Label htmlFor="alert-operator">Operator</Label>
          <Select
            value={form.watch('condition_config.operator')}
            onValueChange={(value) => {
              form.setValue(
                'condition_config.operator',
                value as CreateAlertRuleDto['condition_config']['operator'],
                {
                  shouldDirty: true,
                  shouldValidate: true,
                },
              );
            }}
          >
            <SelectTrigger id="alert-operator" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALERT_OPERATORS.map((operator) => (
                <SelectItem key={operator} value={operator}>
                  {OPERATOR_LABELS[operator]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="alert-threshold">Threshold</Label>
          <Input
            id="alert-threshold"
            className="mt-1"
            type="number"
            step="0.01"
            {...form.register('condition_config.threshold', { valueAsNumber: true })}
          />
          {errors.condition_config?.threshold ? (
            <p className="mt-1 text-xs text-danger-text">
              {errors.condition_config.threshold.message}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="alert-duration">Duration minutes</Label>
          <Input
            id="alert-duration"
            className="mt-1"
            min={0}
            max={1440}
            placeholder="Optional"
            type="number"
            {...form.register('condition_config.duration_minutes', {
              setValueAs: (value) => (value === '' ? undefined : Number(value)),
            })}
          />
        </div>

        <div>
          <Label htmlFor="alert-cooldown">Cooldown minutes</Label>
          <Input
            id="alert-cooldown"
            className="mt-1"
            min={1}
            max={1440}
            type="number"
            {...form.register('cooldown_minutes', { valueAsNumber: true })}
          />
        </div>

        <div className="md:col-span-2">
          <Label>Severity</Label>
          <RadioGroup
            className="mt-2 flex flex-wrap gap-3"
            value={form.watch('severity')}
            onValueChange={(value) => {
              form.setValue('severity', value as CreateAlertRuleDto['severity'], {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
          >
            {ALERT_SEVERITIES.map((severity) => (
              <Label
                key={severity}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm"
              >
                <RadioGroupItem value={severity} />
                {severity}
              </Label>
            ))}
          </RadioGroup>
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="alert-emails">Email recipients</Label>
          <Input
            id="alert-emails"
            className="mt-1"
            value={emailsInput}
            onChange={(event) => {
              const value = event.target.value;
              setEmailsInput(value);
              form.setValue('notify_emails', splitEmails(value), {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            placeholder="ops@example.com, founder@example.com"
          />
          {errors.notify_emails ? (
            <p className="mt-1 text-xs text-danger-text">Enter valid email addresses.</p>
          ) : null}
        </div>

        <div className="md:col-span-2 rounded-lg border border-border bg-surface-secondary p-3">
          <Label>Delivery channels</Label>
          {channels.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {channels.map((channel) => {
                const selected = form.watch('channel_ids').includes(channel.id);
                return (
                  <Label
                    key={channel.id}
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => toggleChannel(channel.id, checked === true)}
                    />
                    <span className="min-w-0 truncate">
                      {channel.name} · {channel.type}
                    </span>
                  </Label>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-text-tertiary">
              {channelsLoading ? 'Loading channels...' : 'No configured delivery channels.'}
            </p>
          )}
        </div>

        <Label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
          <Checkbox
            checked={form.watch('is_enabled')}
            onCheckedChange={(checked) => {
              form.setValue('is_enabled', checked === true, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
          />
          Enabled
        </Label>

        <Label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
          <Checkbox
            checked={form.watch('is_security_critical')}
            onCheckedChange={(checked) => {
              form.setValue('is_security_critical', checked === true, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
          />
          Security critical
        </Label>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {initialData ? 'Save rule' : 'Create rule'}
        </Button>
      </div>
    </form>
  );
}
