'use client';

import { Eye, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RetentionPolicy {
  id: string;
  tenant_id: string;
  data_category: string;
  retention_months: number;
  action_on_expiry: string;
  is_overridable: boolean;
  statutory_basis: string;
  is_override: boolean;
  default_retention_months: number;
}

interface RetentionHold {
  id: string;
  tenant_id: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  held_by_user_id: string;
  held_at: string;
  released_at: string | null;
  created_at: string;
}

interface PreviewItem {
  data_category: string;
  retention_months: number;
  action_on_expiry: string;
  affected_count: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  active_student_records: 'Active Student Records',
  graduated_withdrawn_students: 'Graduated/Withdrawn Students',
  rejected_admissions: 'Rejected Admissions',
  financial_records: 'Financial Records',
  payroll_records: 'Payroll Records',
  staff_records_post_employment: 'Staff Records (Post-Employment)',
  attendance_records: 'Attendance Records',
  behaviour_records: 'Behaviour Records',
  child_protection_safeguarding: 'Child Protection & Safeguarding',
  communications_notifications: 'Communications & Notifications',
  audit_logs: 'Audit Logs',
  contact_form_submissions: 'Contact Form Submissions',
  parent_inquiry_messages: 'Parent Inquiry Messages',
  nl_query_history: 'Natural Language Query History',
  ai_processing_logs: 'AI Processing Logs',
  tokenisation_usage_logs: 'Tokenisation Usage Logs',
  s3_compliance_exports: 'Compliance Exports',
};

const SUBJECT_TYPES = ['student', 'parent', 'staff', 'household'] as const;

const SUBJECT_TYPE_LABELS: Record<(typeof SUBJECT_TYPES)[number], string> = {
  student: 'Student',
  parent: 'Parent',
  staff: 'Staff',
  household: 'Household',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRetention(months: number): string {
  if (months === 0) return 'Indefinite';
  if (months >= 12 && months % 12 === 0) return `${months / 12} year${months / 12 > 1 ? 's' : ''}`;
  return `${months} month${months > 1 ? 's' : ''}`;
}

function formatActionBadge(action: string): {
  label: string;
  variant: 'default' | 'warning' | 'danger' | 'secondary';
} {
  switch (action) {
    case 'anonymise':
      return { label: 'Anonymise', variant: 'warning' };
    case 'delete':
      return { label: 'Delete', variant: 'danger' };
    case 'archive':
      return { label: 'Archive', variant: 'secondary' };
    default:
      return { label: action, variant: 'default' };
  }
}

function formatDateTimeLocale(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataRetentionSettingsPage() {
  const t = useTranslations('retention');

  // ─── Policies state ───────────────────────────────────────────────────────
  const [policies, setPolicies] = React.useState<RetentionPolicy[]>([]);
  const [policiesLoading, setPoliciesLoading] = React.useState(true);

  // ─── Holds state ──────────────────────────────────────────────────────────
  const [holds, setHolds] = React.useState<RetentionHold[]>([]);
  const [holdsLoading, setHoldsLoading] = React.useState(true);

  // ─── Edit dialog ──────────────────────────────────────────────────────────
  const [editPolicy, setEditPolicy] = React.useState<RetentionPolicy | null>(null);
  const [editMonths, setEditMonths] = React.useState<number>(0);
  const [editSaving, setEditSaving] = React.useState(false);
  const [editConfirming, setEditConfirming] = React.useState(false);

  // ─── Preview dialog ──────────────────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<PreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  // ─── Place hold dialog ───────────────────────────────────────────────────
  const [holdDialogOpen, setHoldDialogOpen] = React.useState(false);
  const [holdSubjectType, setHoldSubjectType] = React.useState('');
  const [holdSubjectId, setHoldSubjectId] = React.useState('');
  const [holdReason, setHoldReason] = React.useState('');
  const [holdCreating, setHoldCreating] = React.useState(false);

  // ─── Release confirmation ─────────────────────────────────────────────────
  const [releaseHoldId, setReleaseHoldId] = React.useState<string | null>(null);
  const [releaseLoading, setReleaseLoading] = React.useState(false);

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchPolicies = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: RetentionPolicy[] }>('/v1/retention-policies');
      setPolicies(res.data);
    } catch (err) {
      console.error('[DataRetentionSettingsPage.fetchPolicies]', err);
      toast.error(t('fetchError'));
    } finally {
      setPoliciesLoading(false);
    }
  }, [t]);

  const fetchHolds = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: RetentionHold[] }>('/v1/retention-holds');
      setHolds(res.data.filter((h) => h.released_at === null));
    } catch (err) {
      console.error('[DataRetentionSettingsPage.fetchHolds]', err);
      toast.error(t('holdError'));
    } finally {
      setHoldsLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void fetchPolicies();
    void fetchHolds();
  }, [fetchPolicies, fetchHolds]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleEditOpen = React.useCallback((policy: RetentionPolicy) => {
    setEditPolicy(policy);
    setEditMonths(policy.retention_months);
    setEditConfirming(false);
  }, []);

  const handleEditSave = React.useCallback(async () => {
    if (!editPolicy) return;
    if (editMonths < editPolicy.default_retention_months) {
      toast.error(t('belowMinimum'));
      return;
    }
    // First click: enter confirming state — require a second click to actually save
    if (!editConfirming) {
      setEditConfirming(true);
      return;
    }
    setEditSaving(true);
    try {
      const updated = await apiClient<RetentionPolicy>(`/v1/retention-policies/${editPolicy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ retention_months: editMonths }),
      });
      setPolicies((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success(t('saved'));
      setEditPolicy(null);
      setEditConfirming(false);
    } catch (err) {
      console.error('[DataRetentionSettingsPage.handleEditSave]', err);
      toast.error(t('fetchError'));
    } finally {
      setEditSaving(false);
    }
  }, [editPolicy, editMonths, editConfirming, t]);

  const handlePreview = React.useCallback(async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const res = await apiClient<{ data: PreviewItem[] }>('/v1/retention-policies/preview', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setPreviewData(res.data);
    } catch (err) {
      console.error('[DataRetentionSettingsPage.handlePreview]', err);
      toast.error(t('fetchError'));
    } finally {
      setPreviewLoading(false);
    }
  }, [t]);

  const handlePlaceHold = React.useCallback(async () => {
    setHoldCreating(true);
    try {
      await apiClient('/v1/retention-holds', {
        method: 'POST',
        body: JSON.stringify({
          subject_type: holdSubjectType,
          subject_id: holdSubjectId,
          reason: holdReason,
        }),
      });
      toast.success(t('holdCreated'));
      setHoldDialogOpen(false);
      setHoldSubjectType('');
      setHoldSubjectId('');
      setHoldReason('');
      await fetchHolds();
    } catch (err) {
      console.error('[DataRetentionSettingsPage.handlePlaceHold]', err);
      toast.error(t('holdError'));
    } finally {
      setHoldCreating(false);
    }
  }, [holdSubjectType, holdSubjectId, holdReason, t, fetchHolds]);

  const handleReleaseHold = React.useCallback(async () => {
    if (!releaseHoldId) return;
    setReleaseLoading(true);
    try {
      await apiClient(`/v1/retention-holds/${releaseHoldId}`, { method: 'DELETE' });
      toast.success(t('holdReleased'));
      setReleaseHoldId(null);
      await fetchHolds();
    } catch (err) {
      console.error('[DataRetentionSettingsPage.handleReleaseHold]', err);
      toast.error(t('holdError'));
    } finally {
      setReleaseLoading(false);
    }
  }, [releaseHoldId, t, fetchHolds]);

  // ─── Loading skeleton ────────────────────────────────────────────────────

  if (policiesLoading && holdsLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <PageHeader title={t('title')} description={t('description')} />

      {/* ── Retention Policies ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">{t('policiesTitle')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('description')}</p>
          </div>
          <Button variant="outline" onClick={handlePreview}>
            <Eye className="me-2 h-4 w-4" />
            {t('previewImpact')}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-t border-border">
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('category')}
                </th>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('retentionPeriod')}
                </th>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('actionOnExpiry')}
                </th>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('status')}
                </th>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('statutoryBasis')}
                </th>
                <th className="px-5 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => {
                const action = formatActionBadge(policy.action_on_expiry);
                return (
                  <tr
                    key={policy.id}
                    className={`border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary ${!policy.is_overridable ? 'opacity-60' : ''}`}
                  >
                    <td className="px-5 py-3 text-sm font-medium text-text-primary">
                      <div className="flex items-center gap-2">
                        {!policy.is_overridable && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Lock className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('lockedTooltip', { basis: policy.statutory_basis })}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {CATEGORY_LABELS[policy.data_category] ?? policy.data_category}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-text-secondary">
                      {formatRetention(policy.retention_months)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={action.variant}>{action.label}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {policy.is_override ? (
                        <Badge variant="info">{t('override')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('default')}</Badge>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-5 py-3 text-sm text-text-secondary">
                      {policy.statutory_basis}
                    </td>
                    <td className="px-5 py-3 text-end">
                      {policy.is_overridable ? (
                        <Button variant="ghost" size="sm" onClick={() => handleEditOpen(policy)}>
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">{t('editRetention')}</span>
                        </Button>
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button variant="ghost" size="sm" disabled>
                                  <Lock className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('locked')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legal Holds ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-text-primary">{t('holdsTitle')}</h2>
          <Button onClick={() => setHoldDialogOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('placeHold')}
          </Button>
        </div>
        {holdsLoading ? (
          <div className="px-5 pb-5">
            <div className="h-32 animate-pulse rounded bg-surface-secondary" />
          </div>
        ) : holds.length === 0 ? (
          <p className="px-5 pb-8 pt-2 text-center text-sm text-text-secondary">
            {t('noActiveHolds')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-t border-border">
                  <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('subjectType')}
                  </th>
                  <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('subjectId')}
                  </th>
                  <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('reason')}
                  </th>
                  <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('heldBy')}
                  </th>
                  <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('heldAt')}
                  </th>
                  <th className="px-5 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {holds.map((hold) => (
                  <tr
                    key={hold.id}
                    className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                  >
                    <td className="px-5 py-3">
                      <Badge variant="secondary">{hold.subject_type}</Badge>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-text-secondary">
                      {hold.subject_id}
                    </td>
                    <td className="max-w-[250px] truncate px-5 py-3 text-sm text-text-primary">
                      {hold.reason}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-text-secondary">
                      {hold.held_by_user_id}
                    </td>
                    <td className="px-5 py-3 text-sm text-text-secondary">
                      {formatDateTimeLocale(hold.held_at)}
                    </td>
                    <td className="px-5 py-3 text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger-text hover:text-danger-text"
                        onClick={() => setReleaseHoldId(hold.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">{t('releaseHold')}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit Policy Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={editPolicy !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditPolicy(null);
            setEditConfirming(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editRetention')}</DialogTitle>
            <DialogDescription>
              {editPolicy &&
                (CATEGORY_LABELS[editPolicy.data_category] ?? editPolicy.data_category)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-months">{t('retentionMonths')}</Label>
              <Input
                id="edit-months"
                type="number"
                min={editPolicy?.default_retention_months ?? 1}
                value={editMonths}
                onChange={(e) => {
                  setEditMonths(Number(e.target.value));
                  setEditConfirming(false);
                }}
                className="w-full text-base"
              />
              {editPolicy && (
                <p className="text-xs text-text-tertiary">
                  {t('minimumNotice', { min: String(editPolicy.default_retention_months) })}
                </p>
              )}
            </div>
          </div>
          {editConfirming && editPolicy && (
            <p className="px-1 text-sm text-warning-text">
              {t('saveConfirmPrompt', {
                category: CATEGORY_LABELS[editPolicy.data_category] ?? editPolicy.data_category,
              })}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (editConfirming) {
                  setEditConfirming(false);
                } else {
                  setEditPolicy(null);
                }
              }}
            >
              {editConfirming ? t('back') : t('cancel')}
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editConfirming ? t('confirmChange') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview Impact Dialog ───────────────────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('previewTitle')}</DialogTitle>
            <DialogDescription>{t('previewDescription')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {previewLoading ? (
              <div className="h-32 animate-pulse rounded bg-surface-secondary" />
            ) : previewData.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-secondary">
                {t('noExpiredRecords')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('category')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('retentionPeriod')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('actionOnExpiry')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('affectedRecords')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((item) => {
                      const action = formatActionBadge(item.action_on_expiry);
                      return (
                        <tr
                          key={item.data_category}
                          className="border-b border-border last:border-b-0"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-text-primary">
                            {CATEGORY_LABELS[item.data_category] ?? item.data_category}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">
                            {formatRetention(item.retention_months)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={action.variant}>{action.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-end text-sm font-semibold text-text-primary">
                            {item.affected_count.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Place Hold Dialog ───────────────────────────────────────────────── */}
      <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('placeHold')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="hold-subject-type">{t('subjectType')}</Label>
              <Select value={holdSubjectType} onValueChange={setHoldSubjectType}>
                <SelectTrigger id="hold-subject-type">
                  <SelectValue placeholder={t('subjectType')} />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECT_TYPES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {SUBJECT_TYPE_LABELS[st]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hold-subject-id">{t('subjectId')}</Label>
              <Input
                id="hold-subject-id"
                type="text"
                placeholder={t('uuid')}
                value={holdSubjectId}
                onChange={(e) => setHoldSubjectId(e.target.value)}
                className="w-full text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hold-reason">{t('reason')}</Label>
              <Textarea
                id="hold-reason"
                placeholder={t('reason')}
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                className="w-full text-base"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handlePlaceHold}
              disabled={holdCreating || !holdSubjectType || !holdSubjectId || !holdReason}
            >
              {t('placeHold')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Release Hold Confirmation Dialog ────────────────────────────────── */}
      <Dialog
        open={releaseHoldId !== null}
        onOpenChange={(open) => {
          if (!open) setReleaseHoldId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('releaseHold')}</DialogTitle>
            <DialogDescription>{t('releaseConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseHoldId(null)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleReleaseHold} disabled={releaseLoading}>
              {t('releaseHold')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
