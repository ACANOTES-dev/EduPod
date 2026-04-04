'use client';

import { Plus, Trash2, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffProfile {
  id: string;
  user: { first_name: string; last_name: string };
}

interface ClassStaff {
  id: string;
  role: string;
  staff_profile: StaffProfile;
}

interface StaffAssignmentProps {
  classId: string;
}

// ─── Assign Dialog ────────────────────────────────────────────────────────────

interface AssignDialogProps {
  classId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

function AssignDialog({ classId, open, onOpenChange, onSuccess }: AssignDialogProps) {
  const t = useTranslations('classes');
  const tc = useTranslations('common');

  const [staffProfiles, setStaffProfiles] = React.useState<StaffProfile[]>([]);
  const [staffId, setStaffId] = React.useState('');
  const [role, setRole] = React.useState('teacher');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    apiClient<{ data: StaffProfile[] }>(
      '/api/v1/staff-profiles?pageSize=100&employment_status=active',
    )
      .then((res) => setStaffProfiles(res.data))
      .catch((err) => { console.error('[StaffAssignment]', err); return setStaffProfiles([]); });
  }, [open]);

  const handleSubmit = async () => {
    if (!staffId) {
      setError(t('selectStaffRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient(`/api/v1/classes/${classId}/staff`, {
        method: 'POST',
        body: JSON.stringify({ staff_profile_id: staffId, role }),
      });
      onSuccess();
      onOpenChange(false);
      setStaffId('');
      setRole('teacher');
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assignStaff')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('fieldStaffMember')}</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectStaffMember')} />
              </SelectTrigger>
              <SelectContent>
                {staffProfiles.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user.first_name} {s.user.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('fieldRole')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teacher">{t('roleTeacher')}</SelectItem>
                <SelectItem value="assistant">{t('roleAssistant')}</SelectItem>
                <SelectItem value="homeroom">{t('roleHomeroom')}</SelectItem>
                <SelectItem value="substitute">{t('roleSubstitute')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? tc('loading') : t('assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StaffAssignment({ classId }: StaffAssignmentProps) {
  const t = useTranslations('classes');
  const tc = useTranslations('common');

  const [assignments, setAssignments] = React.useState<ClassStaff[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [assignOpen, setAssignOpen] = React.useState(false);

  const fetchAssignments = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: ClassStaff[] }>(`/api/v1/classes/${classId}/staff`);
      setAssignments(res.data);
    } catch (err) {
      console.error('[StaffAssignment]', err);
      setAssignments([]);
    } finally {
      setIsLoading(false);
    }
  }, [classId]);

  React.useEffect(() => {
    void fetchAssignments();
  }, [fetchAssignments]);

  const handleRemove = async (assignmentId: string) => {
    try {
      await apiClient(`/api/v1/classes/${classId}/staff/${assignmentId}`, {
        method: 'DELETE',
      });
      void fetchAssignments();
    } catch (err) {
      // silently fail
      console.error('[fetchAssignments]', err);
    }
  };

  if (isLoading) {
    return <div className="h-20 animate-pulse rounded-lg bg-surface-secondary" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setAssignOpen(true)}>
          <Plus className="me-1.5 h-4 w-4" />
          {t('assignStaff')}
        </Button>
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={t('noStaffAssigned')}
          description={t('noStaffAssignedDesc')}
          action={{ label: t('assignStaff'), onClick: () => setAssignOpen(true) }}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {a.staff_profile.user.first_name} {a.staff_profile.user.last_name}
                </p>
                <p className="text-xs capitalize text-text-tertiary">{a.role}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(a.id)}
                className="text-danger-text hover:text-danger-text"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">{tc('remove')}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AssignDialog
        classId={classId}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onSuccess={fetchAssignments}
      />
    </div>
  );
}
