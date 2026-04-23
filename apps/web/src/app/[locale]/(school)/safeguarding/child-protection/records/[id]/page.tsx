'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  FolderLock,
  Lock,
  MessageSquareWarning,
  RefreshCw,
  Send,
  ShieldAlert,
  UserCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { CpRecordType } from '@school/shared/pastoral';
import { Button, Input, Label, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CpRecord {
  id: string;
  tenant_id: string;
  student_id: string;
  concern_id: string | null;
  record_type: CpRecordType;
  logged_by_user_id: string;
  logged_by_name: string | null;
  narrative: string;
  mandated_report_status: string | null;
  mandated_report_ref: string | null;
  tusla_contact_name: string | null;
  tusla_contact_date: string | null;
  legal_hold: boolean;
  created_at: string;
  updated_at: string;
}

interface MandatedReport {
  cp_record_id: string;
  student_id: string;
  mandated_report_status: string;
  mandated_report_ref: string | null;
  tusla_contact_name: string | null;
  tusla_contact_date: string | null;
  created_at: string;
  updated_at: string;
}

const RECORD_TYPE_BADGE: Record<string, string> = {
  concern: 'bg-slate-100 text-slate-700',
  mandated_report: 'bg-amber-100 text-amber-700',
  tusla_correspondence: 'bg-indigo-100 text-indigo-700',
  section_26: 'bg-rose-100 text-rose-700',
  disclosure: 'bg-danger-100 text-danger-700',
  retrospective_disclosure: 'bg-danger-100 text-danger-700',
};

const MR_STAGES = ['draft', 'submitted', 'acknowledged', 'outcome_received'] as const;
type MrStage = (typeof MR_STAGES)[number];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CpRecordDetailPage() {
  const t = useTranslations('childProtectionHub.detail');
  const tRoot = useTranslations('childProtectionHub');
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const canView = hasAnyRole(...ADMIN_ROLES);

  const recordId = params?.id ?? '';

  const [record, setRecord] = React.useState<CpRecord | null>(null);
  const [mandatedReport, setMandatedReport] = React.useState<MandatedReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [tuslaRef, setTuslaRef] = React.useState('');
  const [outcomeNotes, setOutcomeNotes] = React.useState('');
  const [mrBusy, setMrBusy] = React.useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!canView || !recordId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const recordPromise = apiClient<{ data: CpRecord } | CpRecord>(
      `/api/v1/child-protection/cp-records/${recordId}`,
    ).then((res) => {
      const data =
        typeof res === 'object' && res !== null && 'data' in res
          ? (res as { data: CpRecord }).data
          : (res as CpRecord);
      return data;
    });

    const mrPromise = apiClient<{ data: MandatedReport | null }>(
      `/api/v1/child-protection/cp-records/${recordId}/mandated-report`,
    ).catch((err) => {
      console.warn('[CpRecordDetail] mandated-report fetch failed', err);
      return { data: null };
    });

    void Promise.all([recordPromise, mrPromise])
      .then(([recordRes, mrRes]) => {
        if (cancelled) return;
        setRecord(recordRes);
        setMandatedReport(mrRes.data);
      })
      .catch((err) => {
        console.error('[CpRecordDetail] load failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, recordId, reloadKey, t]);

  // ── Mandated report actions ──────────────────────────────────────────
  const createDraft = React.useCallback(async () => {
    if (!recordId) return;
    setMrBusy(true);
    try {
      await apiClient(`/api/v1/child-protection/cp-records/${recordId}/mandated-report`, {
        method: 'POST',
      });
      toast.success(t('mandatedReport.toastDraftCreated'));
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error('[CpRecordDetail.createDraft]', err);
      const e = err as { error?: { message?: string } };
      toast.error(e?.error?.message ?? t('mandatedReport.toastDraftFailed'));
    } finally {
      setMrBusy(false);
    }
  }, [recordId, t]);

  const submitReport = React.useCallback(async () => {
    if (!recordId || !tuslaRef.trim()) return;
    setMrBusy(true);
    try {
      await apiClient(`/api/v1/child-protection/cp-records/${recordId}/mandated-report/submit`, {
        method: 'POST',
        body: JSON.stringify({ tusla_reference: tuslaRef.trim() }),
      });
      toast.success(t('mandatedReport.toastSubmitted'));
      setTuslaRef('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error('[CpRecordDetail.submitReport]', err);
      const e = err as { error?: { message?: string } };
      toast.error(e?.error?.message ?? t('mandatedReport.toastSubmitFailed'));
    } finally {
      setMrBusy(false);
    }
  }, [recordId, tuslaRef, t]);

  const advanceStatus = React.useCallback(
    async (status: 'acknowledged' | 'outcome_received') => {
      if (!recordId) return;
      setMrBusy(true);
      try {
        const body: { status: string; outcome_notes?: string } = { status };
        if (status === 'outcome_received' && outcomeNotes.trim()) {
          body.outcome_notes = outcomeNotes.trim();
        }
        await apiClient(`/api/v1/child-protection/cp-records/${recordId}/mandated-report/status`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toast.success(t(`mandatedReport.toastAdvanced.${status}`));
        setOutcomeNotes('');
        setReloadKey((k) => k + 1);
      } catch (err) {
        console.error('[CpRecordDetail.advanceStatus]', err);
        const e = err as { error?: { message?: string } };
        toast.error(e?.error?.message ?? t('mandatedReport.toastAdvanceFailed'));
      } finally {
        setMrBusy(false);
      }
    },
    [recordId, outcomeNotes, t],
  );

  // ── Permission denied ───────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{
            href: `/${locale}/safeguarding/child-protection`,
            label: tRoot('back'),
          }}
        />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold text-text-primary">{tRoot('denied.title')}</h2>
            <p className="text-sm text-text-secondary">{tRoot('denied.body')}</p>
          </div>
        </section>
      </div>
    );
  }

  const backHref = record
    ? `/${locale}/safeguarding/child-protection/students/${record.student_id}`
    : `/${locale}/safeguarding/child-protection`;

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: backHref, label: tRoot('back') }}
        actions={
          record && (
            <Link
              href={`/${locale}/safeguarding/child-protection/export?student_id=${record.student_id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-secondary"
            >
              <Download className="h-3.5 w-3.5" />
              {t('exportCta')}
            </Link>
          )
        }
      />

      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {tRoot('retry')}
          </button>
        </div>
      )}

      {isLoading ? (
        <section className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700" />
        </section>
      ) : !record ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm font-medium text-text-primary">{t('notFound')}</p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          {/* ── Main column ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-6">
            {/* Identity strip */}
            <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-zinc-600 via-zinc-700 to-zinc-800" />
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 shadow-sm ring-1 ring-inset ring-black/5">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${RECORD_TYPE_BADGE[record.record_type] ?? RECORD_TYPE_BADGE.concern}`}
                    >
                      {t(`type.${record.record_type}`)}
                    </span>
                    {record.legal_hold && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger-700">
                        <FolderLock className="h-3 w-3" />
                        {t('legalHold')}
                      </span>
                    )}
                  </div>
                  <p dir="ltr" className="mt-1 truncate font-mono text-xs text-text-tertiary">
                    {record.id}
                  </p>
                </div>
              </div>
            </section>

            {/* Narrative */}
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-text-primary">{t('narrative.title')}</h2>
              <p className="mt-1 text-xs text-text-tertiary">
                {t('narrative.logged', {
                  when: new Date(record.created_at).toLocaleString(fmtLocale(locale)),
                  who: record.logged_by_name ?? t('narrative.unknown'),
                })}
              </p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                {record.narrative}
              </p>
            </section>

            {/* Mandated report */}
            <section className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700" />
              <header className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-sm ring-1 ring-inset ring-black/5">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-text-primary">
                    {t('mandatedReport.title')}
                  </h2>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {t('mandatedReport.description')}
                  </p>
                </div>
              </header>

              <div className="px-5 py-5 sm:px-6">
                <StatusStepper
                  current={(mandatedReport?.mandated_report_status as MrStage | undefined) ?? null}
                  labelKey={(stage) => t(`mrStatus.${stage}`)}
                />

                <div className="mt-6 space-y-4">
                  {!mandatedReport ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-surface-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {t('mandatedReport.noReport.title')}
                        </p>
                        <p className="mt-0.5 text-xs text-text-tertiary">
                          {t('mandatedReport.noReport.body')}
                        </p>
                      </div>
                      <Button type="button" onClick={createDraft} disabled={mrBusy} size="sm">
                        <MessageSquareWarning className="me-1.5 h-3.5 w-3.5" />
                        {mrBusy ? t('mandatedReport.creating') : t('mandatedReport.createDraft')}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label={t('mandatedReport.fields.status')}>
                          <span className="text-sm font-medium text-text-primary">
                            {t(`mrStatus.${mandatedReport.mandated_report_status}`)}
                          </span>
                        </Field>
                        <Field label={t('mandatedReport.fields.tuslaRef')}>
                          {mandatedReport.mandated_report_ref ? (
                            <span dir="ltr" className="font-mono text-sm text-text-primary">
                              {mandatedReport.mandated_report_ref}
                            </span>
                          ) : (
                            <span className="text-sm text-text-tertiary">—</span>
                          )}
                        </Field>
                        <Field label={t('mandatedReport.fields.tuslaContactName')}>
                          <span className="text-sm text-text-primary">
                            {mandatedReport.tusla_contact_name ?? '—'}
                          </span>
                        </Field>
                        <Field label={t('mandatedReport.fields.tuslaContactDate')}>
                          <span className="text-sm text-text-primary">
                            {mandatedReport.tusla_contact_date
                              ? new Date(mandatedReport.tusla_contact_date).toLocaleDateString(
                                  locale,
                                )
                              : '—'}
                          </span>
                        </Field>
                      </dl>

                      {mandatedReport.mandated_report_status === 'draft' && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                          <Label htmlFor="tusla-ref" className="text-xs font-medium">
                            {t('mandatedReport.submit.label')}
                          </Label>
                          <p className="mt-0.5 text-xs text-text-tertiary">
                            {t('mandatedReport.submit.description')}
                          </p>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <Input
                              id="tusla-ref"
                              dir="ltr"
                              value={tuslaRef}
                              onChange={(e) => setTuslaRef(e.target.value)}
                              placeholder={t('mandatedReport.submit.placeholder')}
                              className="font-mono"
                            />
                            <Button
                              type="button"
                              onClick={submitReport}
                              disabled={mrBusy || !tuslaRef.trim()}
                              size="sm"
                              className="shrink-0"
                            >
                              <Send className="me-1.5 h-3.5 w-3.5" />
                              {mrBusy
                                ? t('mandatedReport.submit.submitting')
                                : t('mandatedReport.submit.cta')}
                            </Button>
                          </div>
                        </div>
                      )}

                      {mandatedReport.mandated_report_status === 'submitted' && (
                        <div className="rounded-xl border border-info-200 bg-info-50/60 p-4">
                          <p className="text-sm font-medium text-text-primary">
                            {t('mandatedReport.ack.title')}
                          </p>
                          <p className="mt-0.5 text-xs text-text-tertiary">
                            {t('mandatedReport.ack.description')}
                          </p>
                          <div className="mt-3">
                            <Button
                              type="button"
                              onClick={() => advanceStatus('acknowledged')}
                              disabled={mrBusy}
                              size="sm"
                              variant="outline"
                            >
                              <CheckCircle2 className="me-1.5 h-3.5 w-3.5" />
                              {mrBusy
                                ? t('mandatedReport.ack.submitting')
                                : t('mandatedReport.ack.cta')}
                            </Button>
                          </div>
                        </div>
                      )}

                      {mandatedReport.mandated_report_status === 'acknowledged' && (
                        <div className="rounded-xl border border-success-200 bg-success-50/60 p-4">
                          <Label htmlFor="outcome-notes" className="text-xs font-medium">
                            {t('mandatedReport.outcome.label')}
                          </Label>
                          <p className="mt-0.5 text-xs text-text-tertiary">
                            {t('mandatedReport.outcome.description')}
                          </p>
                          <Textarea
                            id="outcome-notes"
                            value={outcomeNotes}
                            onChange={(e) => setOutcomeNotes(e.target.value)}
                            placeholder={t('mandatedReport.outcome.placeholder')}
                            rows={3}
                            className="mt-2"
                          />
                          <div className="mt-3 flex justify-end">
                            <Button
                              type="button"
                              onClick={() => advanceStatus('outcome_received')}
                              disabled={mrBusy}
                              size="sm"
                            >
                              <CheckCircle2 className="me-1.5 h-3.5 w-3.5" />
                              {mrBusy
                                ? t('mandatedReport.outcome.submitting')
                                : t('mandatedReport.outcome.cta')}
                            </Button>
                          </div>
                        </div>
                      )}

                      {mandatedReport.mandated_report_status === 'outcome_received' && (
                        <div className="flex items-center gap-2 rounded-xl border border-success-200 bg-success-50/60 p-4 text-sm text-success-700">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>{t('mandatedReport.complete')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* ── Sidebar ────────────────────────────────────────────────── */}
          <aside className="flex flex-col gap-4">
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-text-primary">{t('sidebar.student')}</h3>
              <Link
                href={`/${locale}/safeguarding/child-protection/students/${record.student_id}`}
                className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-secondary/40 p-3 transition-colors hover:bg-surface-secondary"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                  <UserCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {t('sidebar.viewRecords')}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-text-tertiary" dir="ltr">
                    {record.student_id}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" />
              </Link>
            </section>

            {record.concern_id && (
              <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('sidebar.linkedConcern')}
                </h3>
                <Link
                  href={`/${locale}/safeguarding/concerns/${record.concern_id}`}
                  className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-secondary/40 p-3 transition-colors hover:bg-surface-secondary"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">
                      {t('sidebar.openConcern')}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-text-tertiary" dir="ltr">
                      {record.concern_id}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" />
                </Link>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-text-primary">{t('sidebar.metadata')}</h3>
              <dl className="mt-3 space-y-3 text-xs">
                <MetaRow label={t('sidebar.createdAt')}>
                  {new Date(record.created_at).toLocaleString(fmtLocale(locale))}
                </MetaRow>
                <MetaRow label={t('sidebar.updatedAt')}>
                  {new Date(record.updated_at).toLocaleString(fmtLocale(locale))}
                </MetaRow>
                <MetaRow label={t('sidebar.legalHold')}>
                  {record.legal_hold ? t('sidebar.legalHoldYes') : t('sidebar.legalHoldNo')}
                </MetaRow>
              </dl>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-secondary/30 p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="text-end text-text-primary">{children}</dd>
    </div>
  );
}

function StatusStepper({
  current,
  labelKey,
}: {
  current: MrStage | null;
  labelKey: (stage: MrStage) => string;
}) {
  const currentIdx = current ? MR_STAGES.indexOf(current) : -1;
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {MR_STAGES.map((stage, idx) => {
        const done = currentIdx >= idx;
        const active = currentIdx === idx;
        return (
          <React.Fragment key={stage}>
            <li
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                active
                  ? 'border-amber-300 bg-amber-100 text-amber-800'
                  : done
                    ? 'border-success-200 bg-success-50 text-success-700'
                    : 'border-border bg-surface text-text-tertiary'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                  active
                    ? 'bg-amber-500 text-white'
                    : done
                      ? 'bg-success-500 text-white'
                      : 'bg-border/60 text-text-tertiary'
                }`}
              >
                {idx + 1}
              </span>
              {labelKey(stage)}
            </li>
            {idx < MR_STAGES.length - 1 && (
              <ArrowRight className="h-3 w-3 text-text-tertiary rtl:rotate-180" />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
