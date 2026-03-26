'use client';

import {
  Badge,
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
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  FileText,
  Minus,
  Plus,
  UserCheck,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppealDetail {
  id: string;
  appeal_number: string;
  entity_type: string;
  status: string;
  grounds: string;
  grounds_category: string;
  appellant_type: string;
  submitted_at: string | null;
  hearing_date: string | null;
  hearing_notes: string | null;
  hearing_attendees: Array<{ name: string; role: string }> | null;
  decision: string | null;
  decision_reasoning: string | null;
  decided_at: string | null;
  resulting_amendments: Array<{
    entity_type: string;
    entity_id: string;
    field: string;
    new_value: string;
  }> | null;
  student: { id: string; first_name: string; last_name: string } | null;
  incident: {
    id: string;
    incident_number: string;
    description: string;
    status: string;
    occurred_at: string;
    category: { id: string; name: string; name_ar: string | null; severity: string } | null;
  } | null;
  sanction: {
    id: string;
    sanction_number: string;
    type: string;
    status: string;
    scheduled_date: string | null;
    suspension_start_date: string | null;
    suspension_end_date: string | null;
  } | null;
  reviewer: { id: string; first_name: string; last_name: string } | null;
  decided_by: { id: string; first_name: string; last_name: string } | null;
  exclusion_cases: Array<{
    id: string;
    case_number: string;
    type: string;
    status: string;
  }>;
}

interface StaffOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface HistoryEntry {
  id: string;
  action_type: string;
  performed_by_id: string;
  performed_at: string;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  notes: string | null;
}

interface Amendment {
  entity_type: string;
  entity_id: string;
  field: string;
  new_value: string;
}

// ─── Badge maps ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  hearing_scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  decided: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  withdrawn: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
  withdrawn_appeal: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
};

const GROUNDS_COLORS: Record<string, string> = {
  factual_inaccuracy: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  disproportionate_consequence: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  procedural_error: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  mitigating_circumstances: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  mistaken_identity: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
  other_grounds: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
};

const DECISION_COLORS: Record<string, string> = {
  upheld_original: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
  modified: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  overturned: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

function InlineBadge({ value, colorMap }: { value: string; colorMap: Record<string, string> }) {
  const label = value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const color = colorMap[value] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

// ─── Progress steps ───────────────────────────────────────────────────────────

const PROGRESS_STEPS = ['submitted', 'under_review', 'hearing_scheduled', 'decided'] as const;

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const activeIndex = PROGRESS_STEPS.indexOf(
    currentStatus as (typeof PROGRESS_STEPS)[number],
  );
  const isWithdrawn = currentStatus === 'withdrawn' || currentStatus === 'withdrawn_appeal';

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm dark:bg-surface-secondary">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Progress</h3>
      {isWithdrawn ? (
        <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-3 dark:bg-gray-800/40">
          <XCircle className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Appeal Withdrawn</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {PROGRESS_STEPS.map((step, i) => {
            const isActive = i <= activeIndex;
            const isCurrent = i === activeIndex;
            return (
              <React.Fragment key={step}>
                {i > 0 && (
                  <div
                    className={`h-0.5 flex-1 rounded ${
                      i <= activeIndex ? 'bg-primary-600' : 'bg-border'
                    }`}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      isCurrent
                        ? 'bg-primary-600 text-white ring-4 ring-primary-100 dark:ring-primary-900/30'
                        : isActive
                          ? 'bg-primary-600 text-white'
                          : 'bg-surface-secondary text-text-tertiary dark:bg-gray-800'
                    }`}
                  >
                    {isActive ? <CheckCircle className="h-4 w-4" /> : i + 1}
                  </div>
                  <span
                    className={`text-center text-[10px] capitalize leading-tight ${
                      isActive ? 'font-medium text-text-primary' : 'text-text-tertiary'
                    }`}
                  >
                    {step.replace(/_/g, ' ')}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AppealDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [appeal, setAppeal] = React.useState<AppealDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);

  // Reviewer assignment
  const [staffList, setStaffList] = React.useState<StaffOption[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = React.useState('');

  // Hearing
  const [hearingDate, setHearingDate] = React.useState('');
  const [hearingNotes, setHearingNotes] = React.useState('');
  const [attendees, setAttendees] = React.useState<Array<{ name: string; role: string }>>([]);

  // Decision form
  const [decisionValue, setDecisionValue] = React.useState('');
  const [decisionReasoning, setDecisionReasoning] = React.useState('');
  const [amendments, setAmendments] = React.useState<Amendment[]>([]);

  // Withdraw
  const [withdrawReason, setWithdrawReason] = React.useState('');
  const [showWithdraw, setShowWithdraw] = React.useState(false);

  // Entity history
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);

  // ─── Fetch appeal ───────────────────────────────────────────────────────────

  const fetchAppeal = React.useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient<AppealDetail>(`/api/v1/behaviour/appeals/${id}`);
      setAppeal(res);
      if (res.hearing_date) setHearingDate(res.hearing_date.split('T')[0] ?? '');
      if (res.hearing_notes) setHearingNotes(res.hearing_notes);
      if (res.hearing_attendees) setAttendees(res.hearing_attendees);
      if (res.reviewer) setSelectedReviewerId(res.reviewer.id);
    } catch {
      toast.error('Failed to load appeal');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchHistory = React.useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient<{ data: HistoryEntry[] }>(
        `/api/v1/behaviour/incidents/${appeal?.incident?.id ?? id}/history?pageSize=50`,
      );
      setHistory(res.data ?? []);
    } catch {
      setHistory([]);
    }
  }, [id, appeal?.incident?.id]);

  const loadStaff = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: StaffOption[] }>('/api/v1/staff?pageSize=200');
      setStaffList(res.data ?? []);
    } catch {
      setStaffList([]);
    }
  }, []);

  React.useEffect(() => {
    void fetchAppeal();
  }, [fetchAppeal]);

  React.useEffect(() => {
    if (appeal) {
      void fetchHistory();
      void loadStaff();
    }
  }, [appeal, fetchHistory, loadStaff]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleUpdateAppeal = async (data: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/behaviour/appeals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      toast.success('Appeal updated');
      void fetchAppeal();
    } catch {
      toast.error('Failed to update appeal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecide = async () => {
    if (!decisionValue || !decisionReasoning) {
      toast.error('Decision and reasoning are required');
      return;
    }
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = {
        decision: decisionValue,
        decision_reasoning: decisionReasoning,
      };
      if (hearingNotes) body.hearing_notes = hearingNotes;
      if (attendees.length > 0) body.hearing_attendees = attendees;
      if (decisionValue === 'modified' && amendments.length > 0) {
        body.amendments = amendments;
      }
      await apiClient(`/api/v1/behaviour/appeals/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success('Decision recorded');
      void fetchAppeal();
    } catch {
      toast.error('Failed to record decision');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawReason || withdrawReason.length < 5) {
      toast.error('Please provide a reason (minimum 5 characters)');
      return;
    }
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/behaviour/appeals/${id}/withdraw`, {
        method: 'POST',
        body: JSON.stringify({ reason: withdrawReason }),
      });
      toast.success('Appeal withdrawn');
      setShowWithdraw(false);
      void fetchAppeal();
    } catch {
      toast.error('Failed to withdraw appeal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateDecisionLetter = async () => {
    try {
      await apiClient(`/api/v1/behaviour/appeals/${id}/generate-decision-letter`, {
        method: 'POST',
      });
      toast.success('Decision letter generated (stub)');
    } catch {
      toast.error('Failed to generate decision letter');
    }
  };

  // ─── Amendment row management ───────────────────────────────────────────────

  const addAmendmentRow = () => {
    setAmendments((prev) => [...prev, { entity_type: 'sanction', entity_id: '', field: '', new_value: '' }]);
  };

  const removeAmendmentRow = (index: number) => {
    setAmendments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAmendmentRow = (index: number, key: keyof Amendment, value: string) => {
    setAmendments((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  };

  // ─── Attendee management ────────────────────────────────────────────────────

  const addAttendee = () => {
    setAttendees((prev) => [...prev, { name: '', role: '' }]);
  };

  const removeAttendee = (index: number) => {
    setAttendees((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAttendee = (index: number, key: 'name' | 'role', value: string) => {
    setAttendees((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  };

  // ─── Loading / Not found ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!appeal) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> Back
        </Button>
        <p className="text-sm text-danger-text">Appeal not found.</p>
      </div>
    );
  }

  const studentName = appeal.student
    ? `${appeal.student.first_name} ${appeal.student.last_name}`
    : 'Unknown Student';
  const isTerminal = appeal.status === 'decided' || appeal.status === 'withdrawn' || appeal.status === 'withdrawn_appeal';
  const canDecide = ['submitted', 'under_review', 'hearing_scheduled'].includes(appeal.status);
  const canWithdraw = !isTerminal;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── 1. Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/behaviour/appeals`)}>
              <ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" />
              Appeals
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              {appeal.appeal_number}
            </h1>
            <InlineBadge value={appeal.status} colorMap={STATUS_COLORS} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
            <Link
              href={`/${locale}/students/${appeal.student?.id}`}
              className="font-medium text-primary-600 hover:underline"
            >
              {studentName}
            </Link>
            <span className="text-text-tertiary">|</span>
            <span className="capitalize">{appeal.entity_type} appeal</span>
            {appeal.incident && (
              <>
                <span className="text-text-tertiary">|</span>
                <Link
                  href={`/${locale}/behaviour/incidents/${appeal.incident.id}`}
                  className="font-mono text-xs text-primary-600 hover:underline"
                >
                  {appeal.incident.incident_number}
                </Link>
              </>
            )}
            {appeal.sanction && (
              <>
                <span className="text-text-tertiary">|</span>
                <span className="font-mono text-xs text-text-secondary">
                  {appeal.sanction.sanction_number}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {appeal.status === 'decided' && (
            <Button variant="outline" size="sm" onClick={handleGenerateDecisionLetter}>
              <FileText className="me-1 h-4 w-4" />
              Decision Letter
            </Button>
          )}
          {canWithdraw && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowWithdraw(!showWithdraw)}
            >
              <XCircle className="me-1 h-4 w-4" />
              Withdraw
            </Button>
          )}
        </div>
      </div>

      {/* Withdraw form */}
      {showWithdraw && (
        <div className="rounded-xl border border-danger-fill bg-danger-fill/10 p-4 dark:bg-danger-fill/5">
          <p className="mb-2 text-sm font-medium text-danger-text">Withdraw this appeal</p>
          <Textarea
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
            placeholder="Reason for withdrawal (min 5 characters)..."
            rows={3}
          />
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleWithdraw}
              disabled={actionLoading || withdrawReason.length < 5}
            >
              Confirm Withdraw
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowWithdraw(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── 2. Appellant Info ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm dark:bg-surface-secondary">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          Appellant Information
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="block text-xs text-text-tertiary">Appellant</span>
            <span className="text-sm font-medium text-text-primary">{studentName}</span>
          </div>
          <div>
            <span className="block text-xs text-text-tertiary">Appellant Type</span>
            <Badge variant="secondary" className="mt-0.5 capitalize text-xs">
              {(appeal.appellant_type ?? '').replace(/_/g, ' ')}
            </Badge>
          </div>
          <div>
            <span className="block text-xs text-text-tertiary">Submitted</span>
            <span className="text-sm text-text-primary">{formatDateTime(appeal.submitted_at)}</span>
          </div>
          <div>
            <span className="block text-xs text-text-tertiary">Grounds Category</span>
            <InlineBadge value={appeal.grounds_category} colorMap={GROUNDS_COLORS} />
          </div>
        </div>
        <div className="mt-4">
          <span className="block text-xs text-text-tertiary">Grounds</span>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{appeal.grounds}</p>
        </div>
      </div>

      {/* ── 3. Status Timeline ────────────────────────────────────────────────── */}
      <StatusTimeline currentStatus={appeal.status} />

      {/* ── 4. Reviewer Section ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm dark:bg-surface-secondary">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          Reviewer
        </h2>
        {appeal.reviewer && (
          <div className="mb-3 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">
              {appeal.reviewer.first_name} {appeal.reviewer.last_name}
            </span>
          </div>
        )}
        {!isTerminal && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-64">
              <Label className="mb-1 text-xs">
                {appeal.reviewer ? 'Reassign Reviewer' : 'Assign Reviewer'}
              </Label>
              <Select value={selectedReviewerId} onValueChange={setSelectedReviewerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select staff..." />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!selectedReviewerId || actionLoading}
              onClick={() => handleUpdateAppeal({ reviewer_id: selectedReviewerId })}
            >
              {appeal.reviewer ? 'Reassign' : 'Assign'}
            </Button>
          </div>
        )}
      </div>

      {/* ── 5. Hearing Section ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm dark:bg-surface-secondary">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          Hearing
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1 text-xs">Hearing Date</Label>
            {isTerminal ? (
              <p className="text-sm text-text-primary">{formatDate(appeal.hearing_date) || '--'}</p>
            ) : (
              <div className="flex items-end gap-2">
                <Input
                  type="date"
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
                  className="w-full sm:w-48"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hearingDate || actionLoading}
                  onClick={() => handleUpdateAppeal({ hearing_date: hearingDate })}
                >
                  <Calendar className="me-1 h-3.5 w-3.5" />
                  Schedule
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Attendees */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs">Attendees</Label>
            {!isTerminal && (
              <Button variant="ghost" size="sm" onClick={addAttendee}>
                <Plus className="me-1 h-3.5 w-3.5" />
                Add
              </Button>
            )}
          </div>
          {attendees.length === 0 ? (
            <p className="text-sm text-text-tertiary">No attendees listed.</p>
          ) : (
            <div className="space-y-2">
              {attendees.map((att, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={att.name}
                    onChange={(e) => updateAttendee(i, 'name', e.target.value)}
                    placeholder="Name"
                    className="w-full sm:flex-1"
                    disabled={isTerminal}
                  />
                  <Input
                    value={att.role}
                    onChange={(e) => updateAttendee(i, 'role', e.target.value)}
                    placeholder="Role"
                    className="w-full sm:w-40"
                    disabled={isTerminal}
                  />
                  {!isTerminal && (
                    <Button variant="ghost" size="icon" onClick={() => removeAttendee(i)}>
                      <Minus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {!isTerminal && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() =>
                    handleUpdateAppeal({ hearing_attendees: attendees.filter((a) => a.name.trim()) })
                  }
                >
                  Save Attendees
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Hearing Notes */}
        {!isTerminal && (
          <div className="mt-4">
            <Label className="mb-1 text-xs">Hearing Notes</Label>
            <Textarea
              value={hearingNotes}
              onChange={(e) => setHearingNotes(e.target.value)}
              placeholder="Notes from the hearing..."
              rows={4}
            />
          </div>
        )}
        {isTerminal && appeal.hearing_notes && (
          <div className="mt-4">
            <Label className="mb-1 text-xs">Hearing Notes</Label>
            <p className="whitespace-pre-wrap text-sm text-text-primary">{appeal.hearing_notes}</p>
          </div>
        )}
      </div>

      {/* ── 6. Decision Form ──────────────────────────────────────────────────── */}
      {canDecide && (
        <div className="rounded-xl border-2 border-primary-200 bg-surface p-5 shadow-sm dark:border-primary-800 dark:bg-surface-secondary">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-400">
            Record Decision
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 text-xs">Decision</Label>
              <Select value={decisionValue} onValueChange={setDecisionValue}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select decision..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upheld_original">Upheld (Original Stands)</SelectItem>
                  <SelectItem value="modified">Modified</SelectItem>
                  <SelectItem value="overturned">Overturned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <Label className="mb-1 text-xs">Decision Reasoning</Label>
            <Textarea
              value={decisionReasoning}
              onChange={(e) => setDecisionReasoning(e.target.value)}
              placeholder="Explain the reasoning behind this decision (min 10 characters)..."
              rows={4}
            />
          </div>

          {/* Amendments table for 'modified' decision */}
          {decisionValue === 'modified' && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-xs">Amendments</Label>
                <Button variant="ghost" size="sm" onClick={addAmendmentRow}>
                  <Plus className="me-1 h-3.5 w-3.5" />
                  Add Amendment
                </Button>
              </div>
              {amendments.length === 0 ? (
                <p className="text-sm text-text-tertiary">
                  No amendments. Add rows to specify field-level changes.
                </p>
              ) : (
                <div className="space-y-2">
                  {amendments.map((row, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-secondary p-2 dark:bg-surface">
                      <Select
                        value={row.entity_type}
                        onValueChange={(v) => updateAmendmentRow(i, 'entity_type', v)}
                      >
                        <SelectTrigger className="w-full sm:w-32">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="incident">Incident</SelectItem>
                          <SelectItem value="sanction">Sanction</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={row.entity_id}
                        onChange={(e) => updateAmendmentRow(i, 'entity_id', e.target.value)}
                        placeholder="Entity ID"
                        className="w-full sm:flex-1"
                      />
                      <Input
                        value={row.field}
                        onChange={(e) => updateAmendmentRow(i, 'field', e.target.value)}
                        placeholder="Field name"
                        className="w-full sm:w-36"
                      />
                      <Input
                        value={row.new_value}
                        onChange={(e) => updateAmendmentRow(i, 'new_value', e.target.value)}
                        placeholder="New value"
                        className="w-full sm:flex-1"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeAmendmentRow(i)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleDecide}
              disabled={actionLoading || !decisionValue || decisionReasoning.length < 10}
            >
              <CheckCircle className="me-2 h-4 w-4" />
              Submit Decision
            </Button>
          </div>
        </div>
      )}

      {/* ── 7. Resulting Amendments (after decided) ───────────────────────────── */}
      {appeal.decision && appeal.status === 'decided' && (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm dark:bg-surface-secondary">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
            Decision Outcome
          </h2>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <InlineBadge value={appeal.decision} colorMap={DECISION_COLORS} />
            {appeal.decided_by && (
              <span className="text-sm text-text-secondary">
                by {appeal.decided_by.first_name} {appeal.decided_by.last_name}
              </span>
            )}
            {appeal.decided_at && (
              <span className="text-xs text-text-tertiary">
                on {formatDateTime(appeal.decided_at)}
              </span>
            )}
          </div>
          {appeal.decision_reasoning && (
            <p className="whitespace-pre-wrap text-sm text-text-primary">
              {appeal.decision_reasoning}
            </p>
          )}

          {/* Resulting amendments diff table */}
          {appeal.resulting_amendments && appeal.resulting_amendments.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold text-text-tertiary">Amendments Applied</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                        Entity
                      </th>
                      <th className="px-3 py-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                        Field
                      </th>
                      <th className="px-3 py-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                        New Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {appeal.resulting_amendments.map((am, i) => (
                      <tr key={i} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {am.entity_type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-text-secondary">
                          {am.field}
                        </td>
                        <td className="px-3 py-2 text-text-primary">{am.new_value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 8. Entity History ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm dark:bg-surface-secondary">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          History
        </h2>
        {history.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-tertiary">No history records.</p>
        ) : (
          <div className="relative space-y-0">
            {/* Vertical timeline line */}
            <div className="absolute start-3 top-0 h-full w-0.5 bg-border" />
            {history.map((entry) => (
              <div key={entry.id} className="relative flex gap-4 py-3 ps-10">
                {/* Dot */}
                <div className="absolute start-1.5 top-4 h-3 w-3 rounded-full border-2 border-primary-600 bg-surface dark:bg-surface-secondary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium capitalize text-text-primary">
                      {entry.action_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {formatDateTime(entry.performed_at)}
                    </span>
                  </div>
                  {entry.notes && (
                    <p className="mt-1 text-sm text-text-secondary">{entry.notes}</p>
                  )}
                  {entry.new_values && Object.keys(entry.new_values).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {Object.entries(entry.new_values).map(([key, val]) => (
                        <span
                          key={key}
                          className="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-secondary dark:bg-gray-800"
                        >
                          {key}: {String(val)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
