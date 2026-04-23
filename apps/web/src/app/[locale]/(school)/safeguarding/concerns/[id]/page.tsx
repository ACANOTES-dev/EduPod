'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileDown,
  FolderLock,
  Lock,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient, getAccessToken } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';

import {
  SEVERITY_BADGE_STYLES,
  STATUS_BADGE_STYLES,
  VALID_STATUS_TRANSITIONS,
  type ConcernDetail,
  type ConcernActionRow,
  type ConcernSeverity,
  type ConcernStatus,
  type SealStatusPayload,
} from '../../_components/concerns';
import { canViewSafeguarding, canViewSealedRecords } from '../../_components/visibility';

interface DetailResponse {
  data: ConcernDetail;
}
interface ActionsResponse {
  data: ConcernActionRow[];
  meta: { page: number; pageSize: number; total: number };
}
interface SealStatusResponse {
  data: SealStatusPayload;
}

export default function SafeguardingConcernDetailPage() {
  const t = useTranslations('safeguardingHub.concernDetail');
  const tSev = useTranslations('safeguardingHub.severity');
  const tStatus = useTranslations('safeguardingHub.concernStatus');
  const tType = useTranslations('safeguardingHub.concernType');
  const tActionType = useTranslations('safeguardingHub.actionType');
  const tHub = useTranslations('safeguardingHub');
  const params = useParams<{ id: string; locale: string }>();
  const pathname = usePathname();
  const locale = params?.locale ?? (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const concernId = params?.id ?? '';
  const { roleKeys } = useRoleCheck();
  const canView = canViewSafeguarding(roleKeys);
  const canSeal = canViewSealedRecords(roleKeys);

  const [concern, setConcern] = React.useState<ConcernDetail | null>(null);
  const [actions, setActions] = React.useState<ConcernActionRow[]>([]);
  const [sealStatus, setSealStatus] = React.useState<SealStatusPayload | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!canView || !concernId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void Promise.allSettled([
      apiClient<DetailResponse>(`/api/v1/safeguarding/concerns/${concernId}`, { silent: true }),
      apiClient<ActionsResponse>(`/api/v1/safeguarding/concerns/${concernId}/actions?pageSize=50`, {
        silent: true,
      }),
      apiClient<SealStatusResponse>(`/api/v1/safeguarding/concerns/${concernId}/seal-status`, {
        silent: true,
      }),
    ]).then(([detailRes, actionsRes, sealRes]) => {
      if (cancelled) return;
      if (detailRes.status === 'fulfilled') {
        setConcern(detailRes.value.data);
      } else {
        console.error('[SafeguardingDetail] detail failed', detailRes.reason);
        setError(t('loadError'));
      }
      if (actionsRes.status === 'fulfilled') {
        setActions(actionsRes.value.data ?? []);
      } else {
        console.warn('[SafeguardingDetail] actions failed', actionsRes.reason);
      }
      if (sealRes.status === 'fulfilled') {
        setSealStatus(sealRes.value.data);
      } else {
        console.warn('[SafeguardingDetail] seal-status failed', sealRes.reason);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [canView, concernId, reloadKey, t]);

  const triggerReload = React.useCallback(() => setReloadKey((k) => k + 1), []);

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{ href: `/${locale}/safeguarding/concerns`, label: t('backToList') }}
        />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{tHub('denied.body')}</p>
          <Link
            href={`/${locale}/safeguarding`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {tHub('denied.backToHub')}
          </Link>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{ href: `/${locale}/safeguarding/concerns`, label: t('backToList') }}
        />
        <section className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={triggerReload}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {tHub('retry')}
          </button>
        </section>
      </div>
    );
  }

  if (isLoading || !concern) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{ href: `/${locale}/safeguarding/concerns`, label: t('backToList') }}
        />
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-6">
          <div className="h-4 w-1/3 animate-pulse rounded bg-border/40" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-border/30" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-border/30" />
        </section>
      </div>
    );
  }

  const isSealed = concern.status === 'sealed';
  const sevKey = (concern.severity as ConcernSeverity) ?? 'low';
  const statusKey = (concern.status as ConcernStatus) ?? 'reported';
  const sevStyle = SEVERITY_BADGE_STYLES[sevKey] ?? SEVERITY_BADGE_STYLES.unknown;
  const statusStyle = STATUS_BADGE_STYLES[statusKey] ?? STATUS_BADGE_STYLES.unknown;
  const nextStatuses = VALID_STATUS_TRANSITIONS[statusKey] ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={`${concern.concern_number}`}
        description={t('description')}
        back={{ href: `/${locale}/safeguarding/concerns`, label: t('backToList') }}
      />

      {isSealed && (
        <section className="flex items-start gap-3 rounded-2xl border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-800">
          <FolderLock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">{t('sealBanner.title')}</p>
            <p className="text-xs text-zinc-600">
              {t('sealBanner.body', {
                when: concern.sealed_at ? new Date(concern.sealed_at).toLocaleString(fmtLocale(locale)) : '—',
                approver: concern.seal_approved_by?.name ?? t('unknown'),
              })}
            </p>
          </div>
        </section>
      )}

      {/* Header meta panel */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sevStyle}`}
          >
            {tSev(sevKey)}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusStyle}`}
          >
            {tStatus(statusKey)}
          </span>
          <span className="inline-flex rounded-full border border-border bg-surface-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            {tType(concern.concern_type)}
          </span>
          {concern.sla_breached && (
            <span className="inline-flex items-center gap-1 rounded-full border border-danger-200 bg-danger-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger-700">
              <Clock className="h-3 w-3" /> {t('slaBreached')}
            </span>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <MetaRow label={t('meta.student')} value={concern.student?.name ?? t('unknown')} />
          <MetaRow label={t('meta.reportedBy')} value={concern.reported_by?.name ?? t('unknown')} />
          <MetaRow
            label={t('meta.reportedAt')}
            value={new Date(concern.created_at).toLocaleString(fmtLocale(locale))}
          />
          <MetaRow
            label={t('meta.assignedTo')}
            value={concern.assigned_to?.name ?? t('unassigned')}
          />
          <MetaRow
            label={t('meta.designatedLiaison')}
            value={concern.designated_liaison?.name ?? t('unassigned')}
          />
          <MetaRow
            label={t('meta.slaDeadline')}
            value={
              concern.sla_first_response_due
                ? new Date(concern.sla_first_response_due).toLocaleString(fmtLocale(locale))
                : '—'
            }
          />
        </dl>

        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-text-primary">{t('narrative.description')}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
            {concern.description}
          </p>
        </div>
        {concern.immediate_actions_taken && (
          <div className="mt-4 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('narrative.immediateActions')}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
              {concern.immediate_actions_taken}
            </p>
          </div>
        )}
      </section>

      {/* Status + Assign */}
      {!isSealed && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatusPanel
            concernId={concern.id}
            currentStatus={statusKey}
            nextOptions={nextStatuses}
            onSaved={triggerReload}
          />
          <RecordActionPanel concernId={concern.id} onSaved={triggerReload} />
        </div>
      )}

      {/* Referrals */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReferralCard
          title={t('referrals.tusla.title')}
          description={t('referrals.tusla.body')}
          referred={concern.is_tusla_referral}
          referenceNumber={concern.tusla_reference_number}
          referredAt={concern.tusla_referred_at}
          outcome={concern.tusla_outcome}
          locale={locale}
          endpoint={`/api/v1/safeguarding/concerns/${concern.id}/tusla-referral`}
          disabled={isSealed}
          onSaved={triggerReload}
          submitLabel={t('referrals.submit')}
          pendingLabel={t('referrals.submitting')}
          refLabel={t('referrals.referenceNumber')}
          dateLabel={t('referrals.referredAt')}
        />
        <ReferralCard
          title={t('referrals.garda.title')}
          description={t('referrals.garda.body')}
          referred={concern.is_garda_referral}
          referenceNumber={concern.garda_reference_number}
          referredAt={concern.garda_referred_at}
          outcome={null}
          locale={locale}
          endpoint={`/api/v1/safeguarding/concerns/${concern.id}/garda-referral`}
          disabled={isSealed}
          onSaved={triggerReload}
          submitLabel={t('referrals.submit')}
          pendingLabel={t('referrals.submitting')}
          refLabel={t('referrals.referenceNumber')}
          dateLabel={t('referrals.referredAt')}
        />
      </div>

      {/* Timeline */}
      <section className="rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('timeline.title')}</h3>
          <span className="text-xs text-text-tertiary">
            {t('timeline.count', { count: actions.length })}
          </span>
        </header>
        {actions.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-text-tertiary">
            {t('timeline.empty')}
          </div>
        ) : (
          <ol className="divide-y divide-border/50">
            {actions.map((a) => (
              <li key={a.id} className="flex gap-3 px-5 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {tActionType(a.action_type)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-text-secondary">
                    {a.description}
                  </p>
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    {new Date(a.created_at).toLocaleString(fmtLocale(locale))}
                    {a.action_by ? ` · ${a.action_by.name}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Case-file + Seal */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CaseFilePanel concernId={concern.id} />
        {canSeal && (
          <SealPanel
            concernId={concern.id}
            sealStatus={sealStatus}
            isSealed={isSealed}
            onSaved={triggerReload}
          />
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd className="text-sm text-text-primary">{value}</dd>
    </div>
  );
}

interface StatusPanelProps {
  concernId: string;
  currentStatus: ConcernStatus;
  nextOptions: ConcernStatus[];
  onSaved: () => void;
}

function StatusPanel({ concernId, currentStatus, nextOptions, onSaved }: StatusPanelProps) {
  const t = useTranslations('safeguardingHub.concernDetail');
  const tStatus = useTranslations('safeguardingHub.concernStatus');
  const [nextStatus, setNextStatus] = React.useState<string>('');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [panelError, setPanelError] = React.useState<string | null>(null);

  const canSubmit = nextStatus !== '' && reason.trim().length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setPanelError(null);
    try {
      await apiClient(`/api/v1/safeguarding/concerns/${concernId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, reason }),
        silent: true,
      });
      setNextStatus('');
      setReason('');
      onSaved();
    } catch (err) {
      console.error('[SafeguardingDetail] transition failed', err);
      setPanelError(t('statusPanel.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('statusPanel.title')}</h3>
      </div>
      <p className="text-xs text-text-tertiary">
        {t('statusPanel.currentStatus')}:{' '}
        <span className="font-medium text-text-primary">{tStatus(currentStatus)}</span>
      </p>
      {nextOptions.length === 0 ? (
        <p className="text-xs text-text-tertiary">{t('statusPanel.terminal')}</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('statusPanel.nextStatus')}</Label>
            <Select value={nextStatus} onValueChange={setNextStatus}>
              <SelectTrigger className="text-base sm:text-sm">
                <SelectValue placeholder={t('statusPanel.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {nextOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('statusPanel.reason')}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={t('statusPanel.reasonPlaceholder')}
              className="text-base sm:text-sm"
            />
          </div>
          {panelError && <p className="text-xs text-danger-700">{panelError}</p>}
          <Button type="button" onClick={onSubmit} disabled={!canSubmit}>
            {submitting ? t('statusPanel.submitting') : t('statusPanel.submit')}
          </Button>
        </>
      )}
    </section>
  );
}

interface RecordActionPanelProps {
  concernId: string;
  onSaved: () => void;
}

function RecordActionPanel({ concernId, onSaved }: RecordActionPanelProps) {
  const t = useTranslations('safeguardingHub.concernDetail');
  const tActionType = useTranslations('safeguardingHub.actionType');
  const [actionType, setActionType] = React.useState('note_added');
  const [noteText, setNoteText] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [panelError, setPanelError] = React.useState<string | null>(null);

  const actionTypes = [
    'note_added',
    'meeting_held',
    'parent_contacted',
    'agency_contacted',
    'review_completed',
  ] as const;

  const submitAction = async () => {
    if (noteText.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setPanelError(null);
    try {
      await apiClient(`/api/v1/safeguarding/concerns/${concernId}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action_type: actionType, description: noteText }),
        silent: true,
      });
      setNoteText('');
      onSaved();
    } catch (err) {
      console.error('[SafeguardingDetail] record action failed', err);
      setPanelError(t('actionPanel.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('actionPanel.title')}</h3>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{t('actionPanel.type')}</Label>
        <Select value={actionType} onValueChange={setActionType}>
          <SelectTrigger className="text-base sm:text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actionTypes.map((at) => (
              <SelectItem key={at} value={at}>
                {tActionType(at)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{t('actionPanel.description')}</Label>
        <Textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          placeholder={t('actionPanel.descriptionPlaceholder')}
          className="text-base sm:text-sm"
        />
      </div>
      {panelError && <p className="text-xs text-danger-700">{panelError}</p>}
      <Button
        type="button"
        onClick={submitAction}
        disabled={submitting || noteText.trim().length === 0}
      >
        {submitting ? t('actionPanel.submitting') : t('actionPanel.submit')}
      </Button>
    </section>
  );
}

interface ReferralCardProps {
  title: string;
  description: string;
  referred: boolean;
  referenceNumber: string | null;
  referredAt: string | null;
  outcome: string | null;
  locale: string;
  endpoint: string;
  disabled: boolean;
  onSaved: () => void;
  submitLabel: string;
  pendingLabel: string;
  refLabel: string;
  dateLabel: string;
}

function ReferralCard({
  title,
  description,
  referred,
  referenceNumber,
  referredAt,
  outcome,
  locale,
  endpoint,
  disabled,
  onSaved,
  submitLabel,
  pendingLabel,
  refLabel,
  dateLabel,
}: ReferralCardProps) {
  const t = useTranslations('safeguardingHub.concernDetail');
  const [refNumber, setRefNumber] = React.useState('');
  const [refDate, setRefDate] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = React.useState(false);
  const [panelError, setPanelError] = React.useState<string | null>(null);

  const onSubmit = async () => {
    if (refNumber.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setPanelError(null);
    try {
      const referred_at = new Date(refDate).toISOString();
      await apiClient(endpoint, {
        method: 'POST',
        body: JSON.stringify({ reference_number: refNumber, referred_at }),
        silent: true,
      });
      setRefNumber('');
      onSaved();
    } catch (err) {
      console.error('[SafeguardingDetail] referral failed', err);
      setPanelError(t('referrals.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
      </div>
      {referred ? (
        <div className="space-y-1 rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800">
          <p className="font-medium">{t('referrals.recorded')}</p>
          <p className="text-xs">
            {refLabel}: <span className="font-mono">{referenceNumber ?? '—'}</span>
          </p>
          <p className="text-xs">
            {dateLabel}: {referredAt ? new Date(referredAt).toLocaleString(fmtLocale(locale)) : '—'}
          </p>
          {outcome && (
            <p className="text-xs">
              {t('referrals.outcome')}: {outcome}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{refLabel}</Label>
            <Input
              value={refNumber}
              onChange={(e) => setRefNumber(e.target.value)}
              disabled={disabled}
              className="text-base sm:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{dateLabel}</Label>
            <Input
              type="date"
              value={refDate}
              onChange={(e) => setRefDate(e.target.value)}
              disabled={disabled}
              className="text-base sm:text-sm"
            />
          </div>
          {panelError && <p className="text-xs text-danger-700">{panelError}</p>}
          <Button
            type="button"
            onClick={onSubmit}
            disabled={disabled || submitting || refNumber.trim().length === 0}
          >
            {submitting ? pendingLabel : submitLabel}
          </Button>
        </>
      )}
    </section>
  );
}

function CaseFilePanel({ concernId }: { concernId: string }) {
  const t = useTranslations('safeguardingHub.concernDetail');
  const [pending, setPending] = React.useState<'full' | 'redacted' | null>(null);
  const [panelError, setPanelError] = React.useState<string | null>(null);

  const download = async (redacted: boolean) => {
    setPending(redacted ? 'redacted' : 'full');
    setPanelError(null);
    try {
      const path = redacted
        ? `/api/v1/safeguarding/concerns/${concernId}/case-file/redacted`
        : `/api/v1/safeguarding/concerns/${concernId}/case-file`;
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
      const token = getAccessToken();
      const response = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error(`Case file request failed: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `case-file-${concernId.slice(0, 8)}${redacted ? '-redacted' : ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[SafeguardingDetail] case-file failed', err);
      setPanelError(t('caseFile.error'));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <FileDown className="h-4 w-4 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('caseFile.title')}</h3>
      </div>
      <p className="text-xs text-text-tertiary">{t('caseFile.body')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={() => download(false)}
          disabled={pending !== null}
        >
          {pending === 'full' ? t('caseFile.generating') : t('caseFile.downloadFull')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => download(true)}
          disabled={pending !== null}
        >
          {pending === 'redacted' ? t('caseFile.generating') : t('caseFile.downloadRedacted')}
        </Button>
      </div>
      {panelError && <p className="text-xs text-danger-700">{panelError}</p>}
    </section>
  );
}

interface SealPanelProps {
  concernId: string;
  sealStatus: SealStatusPayload | null;
  isSealed: boolean;
  onSaved: () => void;
}

function SealPanel({ concernId, sealStatus, isSealed, onSaved }: SealPanelProps) {
  const t = useTranslations('safeguardingHub.concernDetail');
  const [reason, setReason] = React.useState('');
  const [rejectReason, setRejectReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState<'init' | 'approve' | 'reject' | null>(null);
  const [panelError, setPanelError] = React.useState<string | null>(null);

  const callSeal = async (
    path: 'initiate' | 'approve' | 'reject',
    body: Record<string, unknown>,
  ) => {
    setSubmitting(path === 'initiate' ? 'init' : path);
    setPanelError(null);
    try {
      await apiClient(`/api/v1/safeguarding/concerns/${concernId}/seal/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
        silent: true,
      });
      setReason('');
      setRejectReason('');
      onSaved();
    } catch (err) {
      console.error('[SafeguardingDetail] seal failed', err);
      setPanelError(t('seal.error'));
    } finally {
      setSubmitting(null);
    }
  };

  const state = sealStatus?.state ?? 'not_initiated';

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('seal.title')}</h3>
      </div>
      <p className="text-xs text-text-tertiary">{t('seal.body')}</p>

      {isSealed ? (
        <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-800">
          <p className="font-medium">{t('seal.alreadySealed')}</p>
        </div>
      ) : state === 'not_initiated' ? (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('seal.initiateReason')}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('seal.initiatePlaceholder')}
              className="text-base sm:text-sm"
            />
          </div>
          {panelError && <p className="text-xs text-danger-700">{panelError}</p>}
          <Button
            type="button"
            onClick={() => callSeal('initiate', { reason })}
            disabled={submitting !== null || reason.trim().length === 0}
          >
            {submitting === 'init' ? t('seal.initiating') : t('seal.initiate')}
          </Button>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">{t('seal.pendingApproval')}</p>
            {sealStatus?.initiated_reason && (
              <p className="mt-1 text-xs">{sealStatus.initiated_reason}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('seal.rejectReason')}</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              placeholder={t('seal.rejectPlaceholder')}
              className="text-base sm:text-sm"
            />
          </div>
          {panelError && <p className="text-xs text-danger-700">{panelError}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={() => callSeal('approve', { confirmation: true })}
              disabled={submitting !== null}
            >
              {submitting === 'approve' ? t('seal.approving') : t('seal.approve')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => callSeal('reject', { reason: rejectReason })}
              disabled={submitting !== null || rejectReason.trim().length === 0}
            >
              {submitting === 'reject' ? t('seal.rejecting') : t('seal.reject')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
