'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { SHAREABLE_LINK_EXPIRY_DAYS } from '@school/shared/budgeting';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { CreateLinkResponse } from './share-types';

interface ScenarioOption {
  /** Scenario key as stored on the link (e.g. 'base', 'cautious'). */
  key: string;
  /** Human label shown on the checkbox. */
  label: string;
  /** Base case is mandatory and disabled in the UI. */
  isBase: boolean;
}

interface Props {
  open: boolean;
  modelId: string;
  snapshotId: string;
  snapshotVersion: number;
  scenarios: ScenarioOption[];
  onClose: () => void;
  onCreated: (link: CreateLinkResponse) => void;
}

const issueLinkFormSchema = z
  .object({
    expires_in_days: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)]),
    setPassword: z.boolean(),
    password: z.string().optional(),
    scenarios_visible: z.array(z.string().min(1)).min(1),
  })
  .superRefine((val, ctx) => {
    if (val.setPassword) {
      if (!val.password || val.password.length < 6) {
        ctx.addIssue({
          path: ['password'],
          code: z.ZodIssueCode.custom,
          message: 'Password must be at least 6 characters',
        });
      }
    }
  });

type IssueLinkFormValues = z.infer<typeof issueLinkFormSchema>;

interface ApiError {
  error?: { code?: string; message?: string };
  status?: number;
}

export function IssueLinkModal({
  open,
  modelId,
  snapshotId,
  snapshotVersion,
  scenarios,
  onClose,
  onCreated,
}: Props) {
  const t = useTranslations('financeBudgetingShare.modal');

  const [issued, setIssued] = React.useState<CreateLinkResponse | null>(null);
  const [showPassword, setShowPassword] = React.useState<boolean>(false);
  const urlInputRef = React.useRef<HTMLInputElement | null>(null);

  const form = useForm<IssueLinkFormValues>({
    resolver: zodResolver(issueLinkFormSchema),
    defaultValues: {
      expires_in_days: 30,
      setPassword: false,
      password: '',
      scenarios_visible: scenarios.map((s) => s.key),
    },
  });

  React.useEffect(() => {
    if (!open) {
      // Reset on close so a re-open shows the form, not the success view.
      form.reset({
        expires_in_days: 30,
        setPassword: false,
        password: '',
        scenarios_visible: scenarios.map((s) => s.key),
      });
      setIssued(null);
      setShowPassword(false);
    }
  }, [open, scenarios, form]);

  // After issue, focus + select the URL input so the user can immediately copy.
  React.useEffect(() => {
    if (issued && urlInputRef.current) {
      urlInputRef.current.focus();
      urlInputRef.current.select();
    }
  }, [issued]);

  const isSubmitting = form.formState.isSubmitting;
  const setPasswordChecked = form.watch('setPassword');
  const expiresInDays = form.watch('expires_in_days');
  const scenariosVisible = form.watch('scenarios_visible') ?? [];

  const onSubmit = async (values: IssueLinkFormValues): Promise<void> => {
    try {
      const body: { expires_in_days: number; password?: string; scenarios_visible: string[] } = {
        expires_in_days: values.expires_in_days,
        scenarios_visible: values.scenarios_visible,
      };
      if (values.setPassword && values.password) {
        body.password = values.password;
      }
      const link = await apiClient<CreateLinkResponse>(
        `/api/v1/budgeting/financial-models/${modelId}/snapshots/${snapshotId}/links`,
        {
          method: 'POST',
          body: JSON.stringify(body),
          silent: true,
        },
      );
      setIssued(link);
      onCreated(link);
    } catch (err) {
      const apiErr = err as ApiError;
      console.error('[IssueLinkModal.submit]', err);
      toast.error(apiErr?.error?.message ?? t('errors.create'));
    }
  };

  const onCopy = async (): Promise<void> => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.full_url);
      toast.success(t('success.copiedToast'));
    } catch (err) {
      console.error('[IssueLinkModal.copy]', err);
      toast.error(t('errors.copy'));
    }
  };

  const toggleScenario = (key: string, checked: boolean): void => {
    const current = form.getValues('scenarios_visible') ?? [];
    if (checked) {
      if (!current.includes(key)) {
        form.setValue('scenarios_visible', [...current, key], { shouldDirty: true });
      }
    } else {
      form.setValue(
        'scenarios_visible',
        current.filter((k) => k !== key),
        { shouldDirty: true },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('success.title')}</DialogTitle>
              <DialogDescription>{t('success.body')}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <Label htmlFor="issued-url">{t('success.urlLabel')}</Label>
              <div className="flex items-stretch gap-2">
                <Input
                  id="issued-url"
                  ref={urlInputRef}
                  readOnly
                  value={issued.full_url}
                  className="font-mono text-xs"
                  dir="ltr"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCopy}
                  aria-label={t('success.copy')}
                >
                  <Copy className="me-1 h-4 w-4" aria-hidden="true" />
                  {t('success.copy')}
                </Button>
              </div>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {t('success.warning')}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" onClick={onClose}>
                {t('success.done')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('title')}</DialogTitle>
              <DialogDescription>{t('subtitle', { version: snapshotVersion })}</DialogDescription>
            </DialogHeader>

            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
              {/* ─── Expiry ─── */}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-text-primary">
                  {t('expires.label')}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {SHAREABLE_LINK_EXPIRY_DAYS.map((days) => (
                    <label
                      key={days}
                      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                        expiresInDays === days
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-border bg-surface text-text-primary hover:bg-surface-secondary'
                      }`}
                    >
                      <input
                        type="radio"
                        value={days}
                        className="sr-only"
                        checked={expiresInDays === days}
                        onChange={() =>
                          form.setValue('expires_in_days', days, { shouldDirty: true })
                        }
                      />
                      {t('expires.days', { count: days })}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-text-tertiary">{t('expires.helper')}</p>
              </fieldset>

              {/* ─── Password ─── */}
              <fieldset className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <Checkbox
                    checked={setPasswordChecked}
                    onCheckedChange={(v) =>
                      form.setValue('setPassword', v === true, { shouldDirty: true })
                    }
                    aria-label={t('password.toggleLabel')}
                  />
                  {t('password.toggleLabel')}
                </label>
                {setPasswordChecked && (
                  <div className="flex items-stretch gap-2">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('password.placeholder')}
                      autoComplete="new-password"
                      {...form.register('password')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? t('password.hide') : t('password.show')}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                )}
                {form.formState.errors.password?.message && (
                  <p className="text-xs text-red-700">
                    {String(form.formState.errors.password.message)}
                  </p>
                )}
                <p className="text-xs text-text-tertiary">{t('password.helper')}</p>
              </fieldset>

              {/* ─── Scenarios visible ─── */}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-text-primary">
                  {t('scenarios.label')}
                </legend>
                <p className="text-xs text-text-tertiary">{t('scenarios.helper')}</p>
                <div className="flex flex-col gap-2">
                  {scenarios.map((s) => {
                    const checked = scenariosVisible.includes(s.key);
                    return (
                      <label
                        key={s.key}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                          s.isBase ? 'cursor-default opacity-90' : 'cursor-pointer'
                        } ${
                          checked
                            ? 'border-primary-500 bg-primary-50/40'
                            : 'border-border bg-surface'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={s.isBase}
                          onCheckedChange={(v) => toggleScenario(s.key, v === true)}
                          aria-label={s.label}
                        />
                        <span className="font-medium text-text-primary">{s.label}</span>
                        {s.isBase && (
                          <span className="ms-auto text-xs text-text-tertiary">
                            {t('scenarios.alwaysOn')}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {form.formState.errors.scenarios_visible?.message && (
                  <p className="text-xs text-red-700">
                    {String(form.formState.errors.scenarios_visible.message)}
                  </p>
                )}
              </fieldset>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? '…' : t('submit')}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
