'use client';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { Lock, Shield, UserPlus } from 'lucide-react';
import { useParams, usePathname } from 'next/navigation';
import * as React from 'react';

import { ActionTimeline, type TimelineAction } from '@/components/behaviour/action-timeline';
import { BreakGlassBanner } from '@/components/behaviour/break-glass-banner';
import { SafeguardingSeverityBadge } from '@/components/behaviour/safeguarding-severity-badge';
import { SafeguardingStatusBadge } from '@/components/behaviour/safeguarding-status-badge';
import { SlaIndicator } from '@/components/behaviour/sla-indicator';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConcernDetail {
  id: string;
  concern_number: string;
  concern_type: string;
  severity: string;
  status: string;
  sla_status: string;
  description: string;
  immediate_actions: string | null;
  reported_at: string;
  student_name: string;
  student_id: string;
  reporter_name: string;
  assigned_to_name: string | null;
  assigned_to_id: string | null;
  is_sealed: boolean;
  sealed_at: string | null;
  sealed_by_name: string | null;
  break_glass_context: string | null;
  tusla_referred: boolean;
  tusla_referred_at: string | null;
  garda_referred: boolean;
  garda_referred_at: string | null;
  incident_id: string | null;
}

interface ActionsResponse {
  data: TimelineAction[];
}

interface ConcernResponse {
  data: ConcernDetail;
}

type MobileTab = 'detail' | 'actions' | 'attachments';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConcernDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const concernId = params.id as string;

  const [concern, setConcern] = React.useState<ConcernDetail | null>(null);
  const [actions, setActions] = React.useState<TimelineAction[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [actionsLoading, setActionsLoading] = React.useState(true);
  const [mobileTab, setMobileTab] = React.useState<MobileTab>('detail');

  // Action form state
  const [actionNote, setActionNote] = React.useState('');
  const [transitionTo, setTransitionTo] = React.useState('');
  const [isSubmittingAction, setIsSubmittingAction] = React.useState(false);

  const fetchConcern = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<ConcernResponse>(`/api/v1/safeguarding/concerns/${concernId}`);
      setConcern(res.data);
    } catch {
      setConcern(null);
    } finally {
      setIsLoading(false);
    }
  }, [concernId]);

  const fetchActions = React.useCallback(async () => {
    setActionsLoading(true);
    try {
      const res = await apiClient<ActionsResponse>(`/api/v1/safeguarding/concerns/${concernId}/actions`);
      setActions(res.data ?? []);
    } catch {
      setActions([]);
    } finally {
      setActionsLoading(false);
    }
  }, [concernId]);

  React.useEffect(() => {
    void fetchConcern();
    void fetchActions();
  }, [fetchConcern, fetchActions]);

  const handleStatusTransition = async () => {
    if (!transitionTo) return;
    setIsSubmittingAction(true);
    try {
      await apiClient(`/api/v1/safeguarding/concerns/${concernId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status: transitionTo, note: actionNote || undefined }),
      });
      setTransitionTo('');
      setActionNote('');
      await Promise.all([fetchConcern(), fetchActions()]);
    } catch {
      // Error handled by global toast
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleAssign = async () => {
    setIsSubmittingAction(true);
    try {
      await apiClient(`/api/v1/safeguarding/concerns/${concernId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ note: actionNote || undefined }),
      });
      setActionNote('');
      await Promise.all([fetchConcern(), fetchActions()]);
    } catch {
      // Error handled by global toast
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleReferral = async (type: 'tusla' | 'garda') => {
    setIsSubmittingAction(true);
    try {
      await apiClient(`/api/v1/safeguarding/concerns/${concernId}/refer`, {
        method: 'POST',
        body: JSON.stringify({ referral_type: type, note: actionNote || undefined }),
      });
      setActionNote('');
      await Promise.all([fetchConcern(), fetchActions()]);
    } catch {
      // Error handled by global toast
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleSeal = async () => {
    setIsSubmittingAction(true);
    try {
      await apiClient(`/api/v1/safeguarding/concerns/${concernId}/seal`, {
        method: 'POST',
        body: JSON.stringify({ note: actionNote || undefined }),
      });
      setActionNote('');
      await Promise.all([fetchConcern(), fetchActions()]);
    } catch {
      // Error handled by global toast
    } finally {
      setIsSubmittingAction(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!concern) {
    return (
      <div className="py-12 text-center">
        <p className="text-text-tertiary">Concern not found.</p>
      </div>
    );
  }

  const isSealed = concern.is_sealed;

  // ─── Detail Panel ───────────────────────────────────────────────────────────
  const detailPanel = (
    <div className="space-y-4">
      {/* Sealed banner */}
      {isSealed && (
        <div className="flex items-start gap-3 rounded-lg border border-gray-300 bg-gray-100 p-4 dark:border-gray-600 dark:bg-gray-800">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-gray-600 dark:text-gray-400" />
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              CASE SEALED
            </p>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              Sealed by {concern.sealed_by_name} on {formatDate(concern.sealed_at)}. Access restricted.
            </p>
          </div>
        </div>
      )}

      {/* Break-glass banner */}
      {concern.break_glass_context && (
        <BreakGlassBanner reason={concern.break_glass_context} />
      )}

      {/* Concern info */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-text-primary">{concern.concern_number}</h2>
          <SafeguardingSeverityBadge severity={concern.severity} />
          <SafeguardingStatusBadge status={concern.status} />
          <SlaIndicator status={concern.sla_status} />
        </div>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-text-tertiary">Student</p>
              <p className="text-sm text-text-primary">{concern.student_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">Concern Type</p>
              <p className="text-sm capitalize text-text-primary">{concern.concern_type.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">Reported By</p>
              <p className="text-sm text-text-primary">{concern.reporter_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">Reported At</p>
              <p className="text-sm text-text-primary">{formatDateTime(concern.reported_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-tertiary">Assigned To</p>
              <p className="text-sm text-text-primary">{concern.assigned_to_name ?? 'Unassigned'}</p>
            </div>
            {concern.incident_id && (
              <div>
                <p className="text-xs font-medium text-text-tertiary">Linked Incident</p>
                <p className="text-sm text-text-primary">{concern.incident_id}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-text-tertiary">Description</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{concern.description}</p>
          </div>

          {concern.immediate_actions && (
            <div>
              <p className="text-xs font-medium text-text-tertiary">Immediate Actions</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{concern.immediate_actions}</p>
            </div>
          )}
        </div>
      </div>

      {/* Referral blocks */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">Tusla Referral</span>
          </div>
          {concern.tusla_referred ? (
            <p className="mt-1 text-xs text-success-text">
              Referred on {formatDate(concern.tusla_referred_at)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-text-tertiary">Not yet referred</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">Garda Referral</span>
          </div>
          {concern.garda_referred ? (
            <p className="mt-1 text-xs text-success-text">
              Referred on {formatDate(concern.garda_referred_at)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-text-tertiary">Not yet referred</p>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Actions Panel ──────────────────────────────────────────────────────────
  const actionsPanel = (
    <div className="space-y-4">
      {/* Action buttons */}
      {!isSealed && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-text-primary">Actions</h2>
          <div className="mt-4 space-y-4">
            {/* Status transition */}
            <div className="space-y-2">
              <Select value={transitionTo} onValueChange={setTransitionTo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Transition status..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="acknowledged">Acknowledge</SelectItem>
                  <SelectItem value="under_investigation">Under Investigation</SelectItem>
                  <SelectItem value="referred">Referred</SelectItem>
                  <SelectItem value="monitoring">Monitoring</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Note */}
            <Textarea
              placeholder="Add a note (optional)..."
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              rows={3}
              className="w-full text-base"
            />

            {/* Action buttons grid */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleStatusTransition}
                disabled={!transitionTo || isSubmittingAction}
                size="sm"
              >
                Update Status
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAssign}
                disabled={isSubmittingAction}
              >
                <UserPlus className="me-1 h-4 w-4" />
                Assign
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReferral('tusla')}
                disabled={isSubmittingAction || concern.tusla_referred}
              >
                Tusla Referral
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReferral('garda')}
                disabled={isSubmittingAction || concern.garda_referred}
              >
                Garda Referral
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeal}
                disabled={isSubmittingAction}
                className="text-gray-600"
              >
                <Lock className="me-1 h-4 w-4" />
                Seal Case
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text-primary">Activity Timeline</h2>
        <div className="mt-3">
          <ActionTimeline actions={actions} isLoading={actionsLoading} />
        </div>
      </div>
    </div>
  );

  // ─── Attachments Panel (placeholder) ────────────────────────────────────────
  const attachmentsPanel = (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-text-primary">Attachments</h2>
      <p className="mt-3 py-6 text-center text-sm text-text-tertiary">
        No attachments yet.
      </p>
    </div>
  );

  // Mobile tab buttons
  const TABS: Array<{ key: MobileTab; label: string }> = [
    { key: 'detail', label: 'Detail' },
    { key: 'actions', label: 'Actions' },
    { key: 'attachments', label: 'Attachments' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={concern.concern_number} />

      {/* Desktop: Two-panel layout */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-5">
        <div className="lg:col-span-3">
          {detailPanel}
        </div>
        <div className="lg:col-span-2">
          {actionsPanel}
          <div className="mt-4">
            {attachmentsPanel}
          </div>
        </div>
      </div>

      {/* Mobile: Tabs */}
      <div className="lg:hidden">
        <div className="flex gap-1 rounded-lg bg-surface-secondary p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMobileTab(tab.key)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mobileTab === tab.key
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {mobileTab === 'detail' && detailPanel}
          {mobileTab === 'actions' && actionsPanel}
          {mobileTab === 'attachments' && attachmentsPanel}
        </div>
      </div>
    </div>
  );
}
