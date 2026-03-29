'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createPrivacyNoticeSchema,
  type CreatePrivacyNoticeDto,
  type PrivacyNoticeVersion,
} from '@school/shared';
import { Button, Input, Label, TipTapEditor, toast } from '@school/ui';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { LegalDocument } from '@/components/legal/legal-document';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';

interface PrivacyNoticeListResponse {
  data: PrivacyNoticeVersion[];
}

const ADMIN_ROLES = ['school_owner', 'school_principal', 'admin', 'school_vice_principal'];

function defaultEffectiveDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function PrivacyNoticeSettingsPage() {
  const t = useTranslations('legal');
  const locale = useLocale();
  const router = useRouter();
  const { roleKeys } = useRoleCheck();
  const [versions, setVersions] = React.useState<PrivacyNoticeVersion[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [previewVersion, setPreviewVersion] = React.useState<PrivacyNoticeVersion | null>(null);

  const canManage = React.useMemo(
    () => roleKeys.some((role) => ADMIN_ROLES.includes(role)),
    [roleKeys],
  );

  React.useEffect(() => {
    if (!canManage) {
      router.replace(`/${locale}/dashboard`);
    }
  }, [canManage, locale, router]);

  const form = useForm<CreatePrivacyNoticeDto>({
    resolver: zodResolver(createPrivacyNoticeSchema),
    defaultValues: {
      effective_date: defaultEffectiveDate(),
      content_html: '',
      content_html_ar: '',
    },
  });

  const selectedVersion = React.useMemo(
    () => versions.find((version) => version.id === selectedId) ?? null,
    [selectedId, versions],
  );

  const isDraft = Boolean(selectedVersion && !selectedVersion.published_at);

  const loadVersions = React.useCallback(
    async (preferredId?: string | null) => {
      try {
        const response = await apiClient<PrivacyNoticeListResponse>('/api/v1/privacy-notices');
        setVersions(response.data);
        const nextSelectedId =
          preferredId ??
          response.data.find((version) => !version.published_at)?.id ??
          response.data[0]?.id ??
          null;

        setSelectedId(nextSelectedId);

        const nextSelectedVersion =
          response.data.find((version) => version.id === nextSelectedId) ?? null;

        if (nextSelectedVersion) {
          form.reset({
            effective_date: nextSelectedVersion.effective_date,
            content_html: nextSelectedVersion.content_html,
            content_html_ar: nextSelectedVersion.content_html_ar ?? '',
          });
        } else {
          form.reset({
            effective_date: defaultEffectiveDate(),
            content_html: '',
            content_html_ar: '',
          });
        }
      } catch (err) {
        console.error('[PrivacyNoticeSettingsPage.loadVersions]', err);
        toast.error(t('privacyLoadError'));
      } finally {
        setLoading(false);
      }
    },
    [form, t],
  );

  React.useEffect(() => {
    if (canManage) {
      void loadVersions();
    }
  }, [canManage, loadVersions]);

  const handleSelect = React.useCallback(
    (version: PrivacyNoticeVersion) => {
      setSelectedId(version.id);
      setPreviewVersion(null);
      form.reset({
        effective_date: version.effective_date,
        content_html: version.content_html,
        content_html_ar: version.content_html_ar ?? '',
      });
    },
    [form],
  );

  const handleCreateDraft = React.useCallback(async () => {
    setCreating(true);
    try {
      const draft = await apiClient<PrivacyNoticeVersion>('/api/v1/privacy-notices', {
        method: 'POST',
        body: JSON.stringify({
          effective_date: defaultEffectiveDate(),
        }),
      });
      toast.success(t('privacyCreateSuccess'));
      await loadVersions(draft.id);
    } catch (err) {
      console.error('[PrivacyNoticeSettingsPage.handleCreateDraft]', err);
      toast.error(t('privacyCreateError'));
    } finally {
      setCreating(false);
    }
  }, [loadVersions, t]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!selectedVersion || selectedVersion.published_at) {
      return;
    }

    try {
      await apiClient<PrivacyNoticeVersion>(`/api/v1/privacy-notices/${selectedVersion.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      toast.success(t('privacySaveSuccess'));
      await loadVersions(selectedVersion.id);
    } catch (err) {
      console.error('[PrivacyNoticeSettingsPage.onSubmit]', err);
      toast.error(t('privacySaveError'));
    }
  });

  const handlePublish = React.useCallback(async () => {
    if (!selectedVersion || selectedVersion.published_at) {
      return;
    }

    setPublishing(true);
    try {
      await apiClient(`/api/v1/privacy-notices/${selectedVersion.id}/publish`, {
        method: 'POST',
      });
      toast.success(t('privacyPublishSuccess'));
      await loadVersions(selectedVersion.id);
    } catch (err) {
      console.error('[PrivacyNoticeSettingsPage.handlePublish]', err);
      toast.error(t('privacyPublishError'));
    } finally {
      setPublishing(false);
    }
  }, [loadVersions, selectedVersion, t]);

  if (!canManage) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('privacyTitle')}
        description={t('privacyDescription')}
        actions={
          <Button onClick={handleCreateDraft} disabled={creating}>
            {creating ? t('privacyCreating') : t('privacyCreateDraft')}
          </Button>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('privacyHistoryTitle')}</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('privacyHistoryDescription')}</p>
            </div>
            <Button variant="outline" onClick={() => setPreviewVersion(selectedVersion)}>
              {t('privacyPreviewCurrent')}
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {versions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-text-secondary">
                {t('privacyEmpty')}
              </div>
            ) : (
              versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => handleSelect(version)}
                  className={`w-full rounded-2xl border p-4 text-start transition-colors ${
                    version.id === selectedId
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-border bg-surface-secondary hover:border-primary-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-text-primary">
                      {t('privacyVersionLabel', { version: version.version_number })}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        version.published_at
                          ? 'bg-success-fill text-success-text'
                          : 'bg-warning-100 text-warning-800'
                      }`}
                    >
                      {version.published_at ? t('privacyPublishedBadge') : t('privacyDraftBadge')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    {t('privacyEffectiveDateLabel', {
                      date: formatDate(version.effective_date),
                    })}
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {version.published_at
                      ? t('privacyPublishedAtLabel', {
                          date: formatDateTime(version.published_at),
                        })
                      : t('privacyDraftHint')}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-6">
          {selectedVersion ? (
            <form className="space-y-6" onSubmit={onSubmit}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {t('privacyEditorTitle', {
                      version: selectedVersion.version_number,
                    })}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {selectedVersion.published_at
                      ? t('privacyEditorPublished')
                      : t('privacyEditorDraft')}
                  </p>
                </div>

                {isDraft ? (
                  <div className="flex gap-2">
                    <Button type="submit" variant="outline" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? t('privacySaving') : t('privacySaveDraft')}
                    </Button>
                    <Button
                      type="button"
                      onClick={handlePublish}
                      disabled={publishing || form.formState.isSubmitting}
                    >
                      {publishing ? t('privacyPublishing') : t('privacyPublish')}
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="effective_date">{t('privacyEffectiveDate')}</Label>
                <Controller
                  control={form.control}
                  name="effective_date"
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="effective_date"
                      type="date"
                      disabled={!isDraft}
                    />
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('privacyEnglishContent')}</Label>
                <Controller
                  control={form.control}
                  name="content_html"
                  render={({ field }) => (
                    <TipTapEditor
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      disabled={!isDraft}
                    />
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('privacyArabicContent')}</Label>
                <Controller
                  control={form.control}
                  name="content_html_ar"
                  render={({ field }) => (
                    <TipTapEditor
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      disabled={!isDraft}
                    />
                  )}
                />
              </div>
            </form>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-text-secondary">
              {t('privacySelectVersion')}
            </div>
          )}
        </div>
      </section>

      {previewVersion ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-text-primary">
              {t('privacyPreviewTitle', {
                version: previewVersion.version_number,
              })}
            </h2>
            <Button variant="outline" onClick={() => setPreviewVersion(null)}>
              {t('closePreview')}
            </Button>
          </div>
          <LegalDocument html={previewVersion.content_html} />
        </section>
      ) : null}
    </div>
  );
}
