'use client';


import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import { AccountingHome } from './_components/accounting-home';
import { AdminHome } from './_components/admin-home';
import { FrontOfficeHome } from './_components/front-office-home';
import { ParentHome } from './_components/parent-home';
import { TeacherHome } from './_components/teacher-home';

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await apiClient<{ data: Record<string, unknown> }>('/api/v1/dashboard/school-admin');
      setData(result.data);
    } catch (err) {
      console.error('[setData]', err);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

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
  return <AdminHome schoolName={schoolName} data={data} />;
}
