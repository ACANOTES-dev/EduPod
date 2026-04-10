'use client';

import React from 'react';

import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import { AccountingHome } from './_components/accounting-home';
import type { DashboardData, PriorityData } from './_components/admin-home';
import { AdminHome } from './_components/admin-home';
import { FrontOfficeHome } from './_components/front-office-home';
import { ParentHome } from './_components/parent-home';
import { TeacherHome } from './_components/teacher-home';

// ─── API response shapes ────────────────────────────────────────────────────

type SchoolAdminApiResponse = {
  data?: {
    stats?: {
      total_students?: number | string;
      active_staff?: number | string;
      total_classes?: number | string;
    };
    pending_approvals?: number;
    admissions?: {
      recent_submissions?: number;
      pending_review?: number;
      accepted?: number;
    };
  };
};

type FinanceDashboardApiResponse = {
  data?: {
    outstanding?: number;
    expected_revenue?: number;
    received_payments?: number;
  };
};

type BehaviourOverviewApiResponse = {
  data?: {
    total_incidents?: number;
    open_follow_ups?: number;
    active_alerts?: number;
  };
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [priorityData, setPriorityData] = React.useState<PriorityData>({});

  const fetchDashboard = React.useCallback(async () => {
    try {
      const result = await apiClient<SchoolAdminApiResponse>('/api/v1/dashboard/school-admin', {
        silent: true,
      });
      const payload = result.data ?? result;
      setData({
        stats: (payload as Record<string, unknown>).stats as DashboardData['stats'],
      });

      // Extract priority items from the dashboard response
      const priority: PriorityData = {};
      const approvals = (payload as Record<string, unknown>).pending_approvals as
        | number
        | undefined;
      const admissions = (payload as Record<string, unknown>).admissions as
        | { pending_review?: number }
        | undefined;

      if (approvals && approvals > 0) {
        priority.pending_approvals = approvals;
      }
      if (admissions?.pending_review && admissions.pending_review > 0) {
        priority.pending_admissions = admissions.pending_review;
      }

      setPriorityData((prev) => ({ ...prev, ...priority }));
    } catch (err) {
      console.error('[fetchDashboard]', err);
    }
  }, []);

  const fetchFinance = React.useCallback(async () => {
    try {
      const result = await apiClient<FinanceDashboardApiResponse>('/api/v1/finance/dashboard', {
        silent: true,
      });
      const finance = result.data ?? result;
      const outstanding = (finance as Record<string, unknown>).outstanding as number | undefined;
      if (outstanding && outstanding > 0) {
        setPriorityData((prev) => ({
          ...prev,
          outstanding_amount: outstanding,
        }));
      }
    } catch (err) {
      console.error('[fetchFinanceDashboard]', err);
    }
  }, []);

  const fetchBehaviour = React.useCallback(async () => {
    try {
      const result = await apiClient<BehaviourOverviewApiResponse>(
        '/api/v1/behaviour/analytics/overview',
        { silent: true },
      );
      const behaviour = result.data ?? result;
      const bData = behaviour as Record<string, unknown>;
      const openCount =
        ((bData.open_follow_ups as number) ?? 0) + ((bData.active_alerts as number) ?? 0);
      if (openCount > 0) {
        setPriorityData((prev) => ({
          ...prev,
          unresolved_incidents: openCount,
        }));
      }
    } catch (err) {
      console.error('[fetchBehaviourOverview]', err);
    }
  }, []);

  const fetchUnlockRequests = React.useCallback(async () => {
    try {
      const result = await apiClient<{ data: unknown[]; meta: { total: number } }>(
        '/api/v1/gradebook/unlock-requests?page=1&pageSize=1',
        { silent: true },
      );
      const total = result.meta?.total ?? result.data?.length ?? 0;
      if (total > 0) {
        setPriorityData((prev) => ({
          ...prev,
          pending_unlock_requests: total,
        }));
      }
    } catch (err) {
      console.error('[fetchUnlockRequests]', err);
    }
  }, []);

  const fetchReportCardRequests = React.useCallback(async () => {
    try {
      const result = await apiClient<{ data: unknown[]; meta: { total: number } }>(
        '/api/v1/report-card-teacher-requests?status=pending&page=1&pageSize=1',
        { silent: true },
      );
      const total = result.meta?.total ?? result.data?.length ?? 0;
      if (total > 0) {
        setPriorityData((prev) => ({
          ...prev,
          pending_report_card_requests: total,
        }));
      }
    } catch (err) {
      console.error('[fetchReportCardRequests]', err);
    }
  }, []);

  React.useEffect(() => {
    void fetchDashboard();
    void fetchFinance();
    void fetchBehaviour();
    void fetchUnlockRequests();
    void fetchReportCardRequests();
  }, [fetchDashboard, fetchFinance, fetchBehaviour, fetchUnlockRequests, fetchReportCardRequests]);

  const schoolName = user?.memberships?.[0]?.tenant?.name || 'EduPod School';

  if (!user?.memberships) return null;
  const roleKeys = user.memberships.flatMap((m) => m.roles?.map((r) => r.role_key) ?? []);

  if (roleKeys.includes('parent')) {
    return <ParentHome schoolName={schoolName} />;
  }
  if (roleKeys.includes('teacher')) {
    return <TeacherHome schoolName={schoolName} />;
  }
  if (roleKeys.includes('school_accountant')) {
    return <AccountingHome schoolName={schoolName} />;
  }
  if (roleKeys.includes('front_office')) {
    return <FrontOfficeHome schoolName={schoolName} />;
  }

  // Default to Principal/Admin/Owner
  return <AdminHome schoolName={schoolName} data={data} priorityData={priorityData} />;
}
