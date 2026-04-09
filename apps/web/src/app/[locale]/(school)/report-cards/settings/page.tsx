'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  updateReportCardTenantSettingsSchema,
  type PersonalInfoField,
  type ReportCardTenantSettingsPayload,
  type UpdateReportCardTenantSettingsDto,
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
  Switch,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import { SignatureUpload } from './_components/signature-upload';

const ADMIN_ROLES = ['school_owner', 'school_principal', 'admin', 'school_vice_principal'];

const PERSONAL_INFO_FIELD_SECTIONS: Array<{ key: string; fields: PersonalInfoField[] }> = [
  {
    key: 'identity',
    fields: ['full_name', 'student_number', 'sex', 'nationality', 'national_id'],
  },
  { key: 'dates', fields: ['date_of_birth', 'admission_date'] },
  { key: 'academic', fields: ['year_group', 'class_name', 'homeroom_teacher'] },
  { key: 'media', fields: ['photo'] },
];

// ─── Shapes the API returns ──────────────────────────────────────────────────

interface SettingsResponse {
  id: string;
  tenant_id: string;
  settings: ReportCardTenantSettingsPayload;
  created_at: string;
  updated_at: string;
}

interface ContentScopeSummary {
  content_scope: string;
  name: string;
  locales: Array<{ template_id: string; locale: string; is_default: boolean }>;
  is_default: boolean;
  is_available: boolean;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ReportCardSettingsPage() {
  const t = useTranslations('reportCards.settings');
  const tw = useTranslations('reportCards.wizard');
  const locale = useLocale();
  const router = useRouter();
  const { roleKeys } = useRoleCheck();

  const canView = React.useMemo(
    () => roleKeys.some((role) => ADMIN_ROLES.includes(role) || role === 'teacher'),
    [roleKeys],
  );
  const canManage = React.useMemo(
    () => roleKeys.some((role) => ADMIN_ROLES.includes(role)),
    [roleKeys],
  );

  const [loading, setLoading] = React.useState(true);
  const [templates, setTemplates] = React.useState<ContentScopeSummary[]>([]);
  const [hasSignature, setHasSignature] = React.useState(false);

  const form = useForm<UpdateReportCardTenantSettingsDto>({
    resolver: zodResolver(updateReportCardTenantSettingsSchema),
    defaultValues: {
      matrix_display_mode: 'grade',
      show_top_rank_badge: false,
      default_personal_info_fields: [],
      require_finalised_comments: true,
      allow_admin_force_generate: true,
      default_template_id: null,
    },
  });

  // Redirect non-viewers.
  React.useEffect(() => {
    if (roleKeys.length === 0) return;
    if (!canView) {
      toast.error(t('permissionDenied'));
      router.replace(`/${locale}/report-cards`);
    }
  }, [canView, locale, roleKeys.length, router, t]);

  // Load settings and template list.
  const loadSettings = React.useCallback(async () => {
    try {
      const res = await apiClient<SettingsResponse>('/api/v1/report-card-tenant-settings');
      const s = res.settings;
      form.reset({
        matrix_display_mode: s.matrix_display_mode,
        show_top_rank_badge: s.show_top_rank_badge,
        default_personal_info_fields: s.default_personal_info_fields,
        require_finalised_comments: s.require_finalised_comments,
        allow_admin_force_generate: s.allow_admin_force_generate,
        default_template_id: s.default_template_id,
        principal_name: s.principal_name ?? null,
      });
      setHasSignature(Boolean(s.principal_signature_storage_key));
    } catch (err) {
      console.error('[ReportCardSettingsPage.loadSettings]', err);
      toast.error(t('loadFailed'));
    }
  }, [form, t]);

  React.useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    async function load() {
      try {
        const [, templatesRes] = await Promise.all([
          loadSettings(),
          apiClient<{ data: ContentScopeSummary[] }>(
            '/api/v1/report-cards/templates/content-scopes',
          ),
        ]);
        if (!cancelled) {
          setTemplates(templatesRes.data ?? []);
        }
      } catch (err) {
        console.error('[ReportCardSettingsPage.load]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [canView, loadSettings]);

  // Submit.
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await apiClient<SettingsResponse>('/api/v1/report-card-tenant-settings', {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      toast.success(t('saved'));
      await loadSettings();
    } catch (err) {
      console.error('[ReportCardSettingsPage.onSubmit]', err);
      toast.error(t('saveFailed'));
    }
  });

  // Available templates (for the default_template_id dropdown).
  const availableTemplates = React.useMemo(() => {
    const rows: Array<{ id: string; label: string }> = [];
    for (const scope of templates) {
      if (!scope.is_available) continue;
      for (const loc of scope.locales) {
        rows.push({ id: loc.template_id, label: `${scope.name} (${loc.locale.toUpperCase()})` });
      }
    }
    return rows;
  }, [templates]);

  if (!canView) return null;

  if (loading) {
    return (
      <div className="space-y-6 pb-10">
        <PageHeader title={t('title')} description={t('subtitle')} />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  const disabled = !canManage;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title={t('title')} description={t('subtitle')} />

      {!canManage ? (
        <div className="rounded-xl border border-border bg-surface-secondary/40 p-3 text-sm text-text-secondary">
          {t('readOnlyNotice')}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Display defaults */}
        <Section title={t('displayDefaults')}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('matrixDisplayMode')}</Label>
              <Controller
                name="matrix_display_mode"
                control={form.control}
                render={({ field }) => (
                  <RadioGroup
                    value={field.value ?? 'grade'}
                    onValueChange={field.onChange}
                    disabled={disabled}
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                      <RadioGroupItem value="grade" />
                      {t('matrixDisplayModeGrade')}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                      <RadioGroupItem value="score" />
                      {t('matrixDisplayModeScore')}
                    </label>
                  </RadioGroup>
                )}
              />
            </div>

            <ToggleRow
              label={t('showTopRankBadge')}
              hint={t('showTopRankBadgeHint')}
              control={form.control}
              name="show_top_rank_badge"
              disabled={disabled}
            />
          </div>
        </Section>

        {/* Comment gate */}
        <Section title={t('commentGate')}>
          <div className="space-y-4">
            <ToggleRow
              label={t('requireFinalisedComments')}
              hint={t('requireFinalisedCommentsHint')}
              control={form.control}
              name="require_finalised_comments"
              disabled={disabled}
            />
            <ToggleRow
              label={t('allowAdminForceGenerate')}
              hint={t('allowAdminForceGenerateHint')}
              control={form.control}
              name="allow_admin_force_generate"
              disabled={disabled}
            />
          </div>
        </Section>

        {/* Personal info defaults */}
        <Section title={t('personalInfoFields')} description={t('personalInfoFieldsHint')}>
          <Controller
            name="default_personal_info_fields"
            control={form.control}
            render={({ field }) => {
              const value = field.value ?? [];
              const toggleField = (f: PersonalInfoField) => {
                if (disabled) return;
                const next = value.includes(f) ? value.filter((x) => x !== f) : [...value, f];
                field.onChange(next);
              };
              return (
                <div className="space-y-5">
                  {PERSONAL_INFO_FIELD_SECTIONS.map((section) => (
                    <div key={section.key} className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        {tw(`fieldSection${section.key[0]!.toUpperCase()}${section.key.slice(1)}`)}
                      </Label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {section.fields.map((f) => {
                          const checked = value.includes(f);
                          return (
                            <label
                              key={f}
                              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-primary-300"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleField(f)}
                                disabled={disabled}
                              />
                              <span className="text-sm text-text-primary">{tw(`field_${f}`)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }}
          />
        </Section>

        {/* Default template */}
        <Section title={t('defaultTemplate')} description={t('defaultTemplateHint')}>
          <Controller
            name="default_template_id"
            control={form.control}
            render={({ field }) => (
              <Select
                value={field.value ?? 'none'}
                onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                disabled={disabled}
              >
                <SelectTrigger className="w-full sm:max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('defaultTemplateNone')}</SelectItem>
                  {availableTemplates.map((tmpl) => (
                    <SelectItem key={tmpl.id} value={tmpl.id}>
                      {tmpl.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Section>

        {/* Grade thresholds link */}
        <Section title={t('gradeThresholdsLink')}>
          <Link
            href={`/${locale}/settings/grade-thresholds`}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            {t('manageGradeThresholds')} →
          </Link>
        </Section>

        {/* Principal details */}
        <Section title={t('principalDetails')}>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="principal_name">{t('principalName')}</Label>
              <Input
                id="principal_name"
                type="text"
                {...form.register('principal_name', {
                  setValueAs: (v) => (typeof v === 'string' && v.trim().length > 0 ? v : null),
                })}
                placeholder={t('principalNamePlaceholder')}
                disabled={disabled}
                className="max-w-md"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('principalSignature')}</Label>
              <SignatureUpload
                hasSignature={hasSignature}
                signatureUrl={null}
                principalName={form.watch('principal_name') ?? ''}
                onUploaded={loadSettings}
                onRemoved={loadSettings}
                disabled={disabled}
              />
            </div>
          </div>
        </Section>

        {/* Save button */}
        {canManage ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('saving') : t('saveChanges')}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {description ? <p className="text-xs text-text-tertiary">{description}</p> : null}
      </div>
      <div className="pt-2">{children}</div>
    </section>
  );
}

// ─── Toggle row helper ───────────────────────────────────────────────────────

type ToggleFieldName =
  | 'show_top_rank_badge'
  | 'require_finalised_comments'
  | 'allow_admin_force_generate';

function ToggleRow({
  label,
  hint,
  control,
  name,
  disabled,
}: {
  label: string;
  hint: string;
  control: ReturnType<typeof useForm<UpdateReportCardTenantSettingsDto>>['control'];
  name: ToggleFieldName;
  disabled: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-secondary/30 p-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-text-primary">{label}</div>
            <p className="mt-1 text-xs text-text-tertiary">{hint}</p>
          </div>
          <Switch
            checked={field.value ?? false}
            onCheckedChange={field.onChange}
            disabled={disabled}
          />
        </div>
      )}
    />
  );
}
