'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { createAlertRuleSchema, type CreateAlertRuleDto } from '@school/shared';
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

import type { PlatformAlertRule } from './alert-rule-list';

interface AlertRuleFormProps {
  initialData?: PlatformAlertRule | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (data: CreateAlertRuleDto) => void;
}

const METRICS: Array<{ value: CreateAlertRuleDto['metric']; label: string }> = [
  { value: 'health_status', label: 'Overall health status' },
  { value: 'component_latency', label: 'Component latency' },
  { value: 'component_status', label: 'Component status' },
  { value: 'disk_free_gb', label: 'Disk free GB' },
  { value: 'bullmq_stuck_jobs', label: 'BullMQ stuck jobs' },
];

const COMPONENTS = ['postgresql', 'redis', 'meilisearch', 'bullmq', 'disk'] as const;
const OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'] as const;
const SEVERITIES = ['info', 'warning', 'critical'] as const;

function splitEmails(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function buildDefaults(initialData?: PlatformAlertRule | null): CreateAlertRuleDto {
  return {
    name: initialData?.name ?? '',
    metric: initialData?.metric ?? 'component_latency',
    condition_config: {
      component: initialData?.condition_config.component ?? 'postgresql',
      operator: initialData?.condition_config.operator ?? 'gt',
      threshold: initialData?.condition_config.threshold ?? 500,
      duration_minutes: initialData?.condition_config.duration_minutes,
    },
    severity: initialData?.severity ?? 'warning',
    cooldown_minutes: initialData?.cooldown_minutes ?? 15,
    is_enabled: initialData?.is_enabled ?? true,
    is_security_critical: initialData?.is_security_critical ?? false,
    notify_emails: initialData?.notify_emails ?? [],
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
  const form = useForm<CreateAlertRuleDto>({
    resolver: zodResolver(createAlertRuleSchema),
    defaultValues: buildDefaults(initialData),
  });

  const metric = form.watch('metric');
  const isComponentMetric = metric === 'component_latency' || metric === 'component_status';
  const errors = form.formState.errors;

  React.useEffect(() => {
    form.reset(buildDefaults(initialData));
    setEmailsInput((initialData?.notify_emails ?? []).join(', '));
  }, [form, initialData]);

  function submit(values: CreateAlertRuleDto) {
    onSubmit({
      ...values,
      notify_emails: splitEmails(emailsInput),
      condition_config: {
        ...values.condition_config,
        component: isComponentMetric ? values.condition_config.component : undefined,
      },
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
              {METRICS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isComponentMetric ? (
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
              {OPERATORS.map((operator) => (
                <SelectItem key={operator} value={operator}>
                  {operator}
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
        </div>

        <div>
          <Label htmlFor="alert-duration">Duration minutes</Label>
          <Input
            id="alert-duration"
            className="mt-1"
            min={1}
            max={60}
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
            {SEVERITIES.map((severity) => (
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
