'use client';

import { Save } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { CompletionGrid } from '../../_components/completion-grid';
import type { StudentCompletion } from '../../_components/completion-grid';



// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeworkBrief {
  id: string;
  title: string;
  max_points?: number;
}

interface CompletionRecord {
  student_id: string;
  student?: { first_name: string; last_name: string };
  status: 'not_started' | 'in_progress' | 'completed';
  notes?: string;
  points_awarded?: number;
  verified?: boolean;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompletionsPage() {
  const t = useTranslations('homework');
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const [hw, setHw] = React.useState<HomeworkBrief | null>(null);
  const [records, setRecords] = React.useState<CompletionRecord[]>([]);
  const [changes, setChanges] = React.useState<Map<string, Partial<StudentCompletion>>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [hwRes, compRes] = await Promise.all([
        apiClient<{ data: HomeworkBrief }>(`/api/v1/homework/${id}`, { silent: true }),
        apiClient<{ data: CompletionRecord[] }>(`/api/v1/homework/${id}/completions`, {
          silent: true,
        }),
      ]);
      setHw(hwRes.data);
      setRecords(compRes.data ?? []);
      setChanges(new Map());
    } catch (err) {
      console.error('[Completions] Failed to load', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const students: StudentCompletion[] = React.useMemo(
    () =>
      records.map((r) => {
        const local = changes.get(r.student_id);
        return {
          student_id: r.student_id,
          student_name: r.student ? `${r.student.first_name} ${r.student.last_name}` : r.student_id,
          status: (local?.status as StudentCompletion['status']) ?? r.status,
          notes: local?.notes ?? r.notes ?? '',
          points_awarded:
            local?.points_awarded !== undefined ? local.points_awarded : (r.points_awarded ?? null),
          verified:
            local?.verified !== undefined ? (local.verified as boolean) : (r.verified ?? false),
        };
      }),
    [records, changes],
  );

  const handleUpdate = React.useCallback(
    (
      studentId: string,
      field: 'status' | 'notes' | 'points_awarded' | 'verified',
      value: string | number | boolean | null,
    ) => {
      setChanges((prev) => {
        const next = new Map(prev);
        const existing = next.get(studentId) ?? {};
        next.set(studentId, { ...existing, [field]: value });
        return next;
      });
    },
    [],
  );

  const handleBulkComplete = React.useCallback(() => {
    setChanges((prev) => {
      const next = new Map(prev);
      for (const r of records) {
        const existing = next.get(r.student_id) ?? {};
        next.set(r.student_id, { ...existing, status: 'completed' });
      }
      return next;
    });
  }, [records]);

  const handleSave = async () => {
    if (changes.size === 0) return;
    setSaving(true);
    try {
      const completions = Array.from(changes.entries()).map(([student_id, c]) => {
        const original = records.find((r) => r.student_id === student_id);
        return {
          student_id,
          status: (c.status as string) ?? original?.status ?? 'not_started',
          notes: c.notes ?? original?.notes,
          points_awarded:
            c.points_awarded !== undefined ? c.points_awarded : original?.points_awarded,
          verified: c.verified !== undefined ? c.verified : original?.verified,
        };
      });
      await apiClient(`/api/v1/homework/${id}/completions/bulk`, {
        method: 'POST',
        body: JSON.stringify({ completions }),
      });
      toast.success(t('changesSaved'));
      void fetchData();
    } catch (err) {
      console.error('[HomeworkCompletionsPage]', err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t('completions')}: ${hw?.title ?? ''}`}
        actions={
          <Button onClick={handleSave} disabled={saving || changes.size === 0}>
            <Save className="me-1 h-4 w-4" />
            {saving ? t('loading') : t('saveChanges')}
          </Button>
        }
      />
      <CompletionGrid
        students={students}
        maxPoints={hw?.max_points ?? null}
        onUpdate={handleUpdate}
        onBulkComplete={handleBulkComplete}
        disabled={saving}
      />
    </div>
  );
}
