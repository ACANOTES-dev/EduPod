'use client';

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FolderLock,
  Lock,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { CpRecordType, ExportPurpose } from '@school/shared/pastoral';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StudentResult {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface PreviewResult {
  preview_token: string;
  record_count: number;
  student_name: string;
  date_range: { from: string | null; to: string | null };
  record_types_found: string[];
}

interface GenerateResult {
  download_token: string;
  export_ref_id: string;
  filename: string;
}

const EXPORT_PURPOSES: ExportPurpose[] = [
  'tusla_request',
  'section_26_inquiry',
  'legal_proceedings',
  'school_transfer_cp',
  'board_of_management',
  'other',
];

const RECORD_TYPES: CpRecordType[] = [
  'concern',
  'mandated_report',
  'tusla_correspondence',
  'section_26',
  'disclosure',
  'retrospective_disclosure',
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CpExportPage() {
  const t = useTranslations('childProtectionHub.export');
  const tRoot = useTranslations('childProtectionHub');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const canView = hasAnyRole(...ADMIN_ROLES);

  const initialStudentId = searchParams?.get('student_id') ?? '';

  const [studentId, setStudentId] = React.useState(initialStudentId);
  const [studentQuery, setStudentQuery] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentResult[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentResult | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);

  const [purpose, setPurpose] = React.useState<ExportPurpose | ''>('');
  const [otherReason, setOtherReason] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [recordTypes, setRecordTypes] = React.useState<Set<CpRecordType>>(new Set());

  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [generated, setGenerated] = React.useState<GenerateResult | null>(null);
  const [stage, setStage] = React.useState<'form' | 'preview' | 'generated'>('form');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ── Preload selected student when ?student_id=... is provided ───────────
  React.useEffect(() => {
    if (!canView || !initialStudentId) return;
    let cancelled = false;
    apiClient<{ data: StudentResult } | StudentResult>(`/api/v1/students/${initialStudentId}`)
      .then((res) => {
        if (cancelled) return;
        const data =
          typeof res === 'object' && res !== null && 'data' in res
            ? (res as { data: StudentResult }).data
            : (res as StudentResult);
        setSelectedStudent(data);
      })
      .catch((err) => {
        console.warn('[CpExport] preselected student load failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, initialStudentId]);

  // ── Debounced student search ────────────────────────────────────────────
  React.useEffect(() => {
    const trimmed = studentQuery.trim();
    if (trimmed.length < 2) {
      setStudentResults([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const handle = setTimeout(() => {
      apiClient<{ data: StudentResult[] }>(
        `/api/v1/students?search=${encodeURIComponent(trimmed)}&pageSize=8&status=active`,
      )
        .then((res) => {
          if (!cancelled) setStudentResults(res.data ?? []);
        })
        .catch((err) => console.error('[CpExport] student search failed', err))
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [studentQuery]);

  const selectStudent = (s: StudentResult) => {
    setSelectedStudent(s);
    setStudentId(s.id);
    setStudentQuery('');
    setStudentResults([]);
  };

  const clearStudent = () => {
    setSelectedStudent(null);
    setStudentId('');
  };

  const toggleRecordType = (type: CpRecordType) => {
    setRecordTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      student_id: studentId,
      purpose,
    };
    if (purpose === 'other') payload.other_reason = otherReason.trim();
    if (recordTypes.size > 0) payload.record_types = Array.from(recordTypes);
    if (dateFrom) payload.date_from = new Date(dateFrom).toISOString();
    if (dateTo) payload.date_to = new Date(dateTo).toISOString();
    return payload;
  };

  const handlePreview = async () => {
    setError(null);
    if (!studentId) {
      setError(t('errors.studentRequired'));
      return;
    }
    if (!purpose) {
      setError(t('errors.purposeRequired'));
      return;
    }
    if (purpose === 'other' && !otherReason.trim()) {
      setError(t('errors.otherReasonRequired'));
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient<PreviewResult | { data: PreviewResult }>(
        '/api/v1/child-protection/export/preview',
        { method: 'POST', body: JSON.stringify(buildPayload()) },
      );
      const payload =
        typeof res === 'object' && res !== null && 'data' in res
          ? (res as { data: PreviewResult }).data
          : (res as PreviewResult);
      setPreview(payload);
      setStage('preview');
    } catch (err) {
      console.error('[CpExport.preview]', err);
      const e = err as { error?: { message?: string } };
      setError(e?.error?.message ?? t('errors.previewFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient<GenerateResult | { data: GenerateResult }>(
        '/api/v1/child-protection/export/generate',
        {
          method: 'POST',
          body: JSON.stringify({ preview_token: preview.preview_token, locale }),
        },
      );
      const payload =
        typeof res === 'object' && res !== null && 'data' in res
          ? (res as { data: GenerateResult }).data
          : (res as GenerateResult);
      setGenerated(payload);
      setStage('generated');
      toast.success(t('generate.toastSuccess'));
    } catch (err) {
      console.error('[CpExport.generate]', err);
      const e = err as { error?: { message?: string } };
      setError(e?.error?.message ?? t('errors.generateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const resetFlow = () => {
    setPreview(null);
    setGenerated(null);
    setStage('form');
    setError(null);
  };

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

      {/* ── Privacy banner ─────────────────────────────────────────────── */}
      <section className="flex items-start gap-3 rounded-2xl border border-zinc-300 bg-zinc-50/70 p-4">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-700">
          <FolderLock className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-zinc-800">{t('privacy.title')}</p>
          <p className="text-xs text-zinc-700">{t('privacy.body')}</p>
        </div>
      </section>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Stage stepper ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs">
        <StageChip
          active={stage === 'form'}
          done={stage !== 'form'}
          step={1}
          label={t('stage.form')}
        />
        <span className="text-text-tertiary">→</span>
        <StageChip
          active={stage === 'preview'}
          done={stage === 'generated'}
          step={2}
          label={t('stage.preview')}
        />
        <span className="text-text-tertiary">→</span>
        <StageChip
          active={stage === 'generated'}
          done={false}
          step={3}
          label={t('stage.download')}
        />
      </div>

      {stage === 'form' && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-text-primary">{t('form.title')}</h2>
          <p className="mt-1 text-xs text-text-tertiary">{t('form.description')}</p>

          <div className="mt-5 space-y-5">
            {/* Student picker */}
            <div className="space-y-2">
              <Label>{t('form.studentLabel')}</Label>
              {selectedStudent ? (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-secondary/40 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {selectedStudent.first_name} {selectedStudent.last_name}
                    </p>
                    {selectedStudent.student_number && (
                      <p dir="ltr" className="truncate font-mono text-xs text-text-tertiary">
                        {selectedStudent.student_number}
                      </p>
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={clearStudent}>
                    {t('form.changeStudent')}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                    <Input
                      value={studentQuery}
                      onChange={(e) => setStudentQuery(e.target.value)}
                      placeholder={t('form.studentPlaceholder')}
                      className="ps-10"
                      autoComplete="off"
                    />
                  </div>
                  {studentQuery.trim().length >= 2 && (
                    <div className="rounded-xl border border-border bg-surface-secondary/30">
                      {isSearching ? (
                        <div className="flex items-center justify-center py-4 text-xs text-text-tertiary">
                          {t('form.searching')}
                        </div>
                      ) : studentResults.length === 0 ? (
                        <div className="flex items-center justify-center py-4 text-xs text-text-tertiary">
                          {t('form.noStudents')}
                        </div>
                      ) : (
                        <ul className="divide-y divide-border/50">
                          {studentResults.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => selectStudent(s)}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-surface"
                              >
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                                  <Users className="h-3.5 w-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-text-primary">
                                    {s.first_name} {s.last_name}
                                  </span>
                                  {s.student_number && (
                                    <span
                                      dir="ltr"
                                      className="block truncate font-mono text-[11px] text-text-tertiary"
                                    >
                                      {s.student_number}
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Purpose */}
            <div className="space-y-2">
              <Label>{t('form.purposeLabel')}</Label>
              <Select value={purpose} onValueChange={(v) => setPurpose(v as ExportPurpose)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('form.purposePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_PURPOSES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`purpose.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {purpose === 'other' && (
              <div className="space-y-2">
                <Label htmlFor="other-reason">{t('form.otherReasonLabel')}</Label>
                <Textarea
                  id="other-reason"
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  placeholder={t('form.otherReasonPlaceholder')}
                  rows={3}
                />
              </div>
            )}

            {/* Record types */}
            <div className="space-y-2">
              <Label>{t('form.recordTypesLabel')}</Label>
              <p className="text-xs text-text-tertiary">{t('form.recordTypesHint')}</p>
              <div className="flex flex-wrap gap-2">
                {RECORD_TYPES.map((type) => {
                  const active = recordTypes.has(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleRecordType(type)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-zinc-500 bg-zinc-100 text-zinc-800'
                          : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      {active && <CheckCircle2 className="h-3 w-3" />}
                      {t(`recordType.${type}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date-from">{t('form.dateFromLabel')}</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    id="date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="ps-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-to">{t('form.dateToLabel')}</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    id="date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="ps-10"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end">
            <Button type="button" onClick={handlePreview} disabled={busy || !studentId || !purpose}>
              <Eye className="me-1.5 h-3.5 w-3.5" />
              {busy ? t('form.previewing') : t('form.previewCta')}
            </Button>
          </div>
        </section>
      )}

      {stage === 'preview' && preview && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-text-primary">{t('preview.title')}</h2>
          <p className="mt-1 text-xs text-text-tertiary">{t('preview.description')}</p>

          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PreviewField label={t('preview.student')}>{preview.student_name}</PreviewField>
            <PreviewField label={t('preview.recordCount')}>
              <span className="text-base font-bold text-text-primary">{preview.record_count}</span>
            </PreviewField>
            <PreviewField label={t('preview.dateFrom')}>
              {preview.date_range.from
                ? new Date(preview.date_range.from).toLocaleDateString(locale)
                : t('preview.allTime')}
            </PreviewField>
            <PreviewField label={t('preview.dateTo')}>
              {preview.date_range.to
                ? new Date(preview.date_range.to).toLocaleDateString(locale)
                : t('preview.present')}
            </PreviewField>
          </dl>

          <div className="mt-4 rounded-xl border border-border bg-surface-secondary/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('preview.recordTypes')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {preview.record_types_found.length === 0 ? (
                <span className="text-xs text-text-tertiary">{t('preview.none')}</span>
              ) : (
                preview.record_types_found.map((rt) => (
                  <span
                    key={rt}
                    className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700"
                  >
                    {t(`recordType.${rt}`)}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={resetFlow} disabled={busy}>
              {t('preview.back')}
            </Button>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={busy || preview.record_count === 0}
            >
              <Download className="me-1.5 h-3.5 w-3.5" />
              {busy ? t('preview.generating') : t('preview.generateCta')}
            </Button>
          </div>
        </section>
      )}

      {stage === 'generated' && generated && (
        <section className="relative overflow-hidden rounded-2xl border border-success-200 bg-success-50/40 p-5 shadow-sm sm:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-success-500 via-success-600 to-success-700" />
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success-100 text-success-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-text-primary">{t('generate.title')}</h2>
              <p className="mt-1 text-xs text-text-tertiary">
                {t('generate.description', { filename: generated.filename })}
              </p>
              <p className="mt-2 text-xs text-text-tertiary">{t('generate.tokenExpiry')}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a
                  href={`/api/v1/child-protection/export/download/${encodeURIComponent(generated.download_token)}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-success-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-success-700"
                  download={generated.filename}
                >
                  <Download className="h-4 w-4" />
                  {t('generate.downloadCta')}
                </a>
                <Button type="button" variant="outline" size="sm" onClick={resetFlow}>
                  <RefreshCw className="me-1.5 h-3.5 w-3.5" />
                  {t('generate.newExportCta')}
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Skip link for keyboard users */}
      <Link
        href={`/${locale}/safeguarding/child-protection`}
        className="text-center text-xs text-text-tertiary hover:text-text-primary"
      >
        {t('backToHub')}
      </Link>
    </div>
  );
}

function StageChip({
  active,
  done,
  step,
  label,
}: {
  active: boolean;
  done: boolean;
  step: number;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        active
          ? 'border-zinc-500 bg-zinc-100 text-zinc-800'
          : done
            ? 'border-success-200 bg-success-50 text-success-700'
            : 'border-border bg-surface text-text-tertiary'
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
          active
            ? 'bg-zinc-700 text-white'
            : done
              ? 'bg-success-500 text-white'
              : 'bg-border/60 text-text-tertiary'
        }`}
      >
        {step}
      </span>
      {label}
    </span>
  );
}

function PreviewField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-secondary/30 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <p className="mt-1 text-sm text-text-primary">{children}</p>
    </div>
  );
}
