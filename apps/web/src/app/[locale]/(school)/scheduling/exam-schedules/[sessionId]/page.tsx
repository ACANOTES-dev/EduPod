/* eslint-disable school/no-hand-rolled-forms -- dashboard config uses inline state by design */
'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Circle,
  ClipboardList,
  Loader2,
  Save,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Checkbox,
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
  Switch,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient, unwrap } from '@/lib/api-client';
import { useExamSolverProgress } from '@/providers/exam-solver-progress-provider';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'matrix' | 'pool' | 'window' | 'review';

interface ExamSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'planning' | 'published' | 'completed';
  slot_count?: number;
}

interface SubjectConfigRow {
  id: string | null;
  year_group_id: string;
  year_group_name: string;
  subject_id: string;
  subject_name: string;
  is_examinable: boolean;
  paper_count: number;
  paper_1_duration_mins: number;
  paper_2_duration_mins: number | null;
  mode: 'in_person' | 'online';
  invigilators_required: number;
  student_count: number;
}

interface PoolMember {
  staff_profile_id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
}

interface SessionConfig {
  allowed_weekdays: number[];
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  min_gap_minutes_same_student: number;
  max_exams_per_day_per_yg: number;
}

interface DetailedSlot {
  id: string;
  subject_name: string | null;
  year_group_name: string | null;
  paper_number: number | null;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  student_count: number;
  rooms: Array<{ id: string; room_id: string; room_name: string | null; capacity: number }>;
  invigilators: Array<{ staff_profile_id: string; name: string; role: string }>;
}

interface EnqueueSolveResponse {
  solve_job_id: string;
  status: 'queued';
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ExamScheduleDetailPage() {
  const t = useTranslations('scheduling.examSchedules');
  const params = useParams();
  const sessionId = (params?.sessionId ?? '') as string;
  const pathname = usePathname() ?? '';
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  const [session, setSession] = React.useState<ExamSession | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<TabId>('matrix');

  const fetchSession = React.useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await apiClient<{ data: ExamSession } | ExamSession>(
        `/api/v1/scheduling/exam-sessions/${sessionId}`,
      );
      setSession(unwrap(res) as ExamSession);
    } catch (err) {
      console.error('[ExamScheduleDetailPage]', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  if (loading || !session) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('description')}
      </div>
    );
  }

  const readOnly = session.status !== 'planning';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={session.name}
        description={`${new Date(session.start_date).toLocaleDateString()} – ${new Date(session.end_date).toLocaleDateString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={session.status === 'published' ? 'default' : 'secondary'}>
              {t(session.status)}
            </Badge>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/${locale}/scheduling/exam-schedules`}>
                <ChevronLeft className="h-4 w-4 me-1 rtl:rotate-180" />
                {t('backToSessions')}
              </Link>
            </Button>
          </div>
        }
      />

      <TabBar tab={tab} onChange={setTab} />

      {tab === 'matrix' && <SubjectMatrixTab sessionId={sessionId} readOnly={readOnly} />}
      {tab === 'pool' && <InvigilatorPoolTab sessionId={sessionId} readOnly={readOnly} />}
      {tab === 'window' && <SessionWindowTab sessionId={sessionId} readOnly={readOnly} />}
      {tab === 'review' && (
        <ReviewTab
          sessionId={sessionId}
          session={session}
          onPublished={() => void fetchSession()}
        />
      )}
    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  const t = useTranslations('scheduling.examSchedules.tabs');
  const items: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'matrix', label: t('subjectMatrix'), icon: <ClipboardList className="h-4 w-4" /> },
    { id: 'pool', label: t('invigilatorPool'), icon: <Users className="h-4 w-4" /> },
    { id: 'window', label: t('sessionWindow'), icon: <Sparkles className="h-4 w-4" /> },
    { id: 'review', label: t('review'), icon: <CheckCircle2 className="h-4 w-4" /> },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1">
        {items.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onChange(i.id)}
            aria-current={tab === i.id ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
              tab === i.id
                ? 'border-brand bg-brand text-brand-contrast shadow-sm ring-2 ring-brand/30 ring-offset-1 ring-offset-surface'
                : 'border-transparent text-text-secondary hover:bg-surface-secondary'
            }`}
          >
            {i.icon}
            {i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Subject Matrix Tab ──────────────────────────────────────────────────────

function SubjectMatrixTab({ sessionId, readOnly }: { sessionId: string; readOnly: boolean }) {
  const t = useTranslations('scheduling.examSchedules.matrix');
  const [rows, setRows] = React.useState<SubjectConfigRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: SubjectConfigRow[] }>(
        `/api/v1/scheduling/exam-sessions/${sessionId}/subject-configs`,
      );
      setRows(res.data ?? []);
    } catch (err) {
      console.error('[SubjectMatrixTab]', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const saveRow = React.useCallback(
    async (row: SubjectConfigRow) => {
      const key = `${row.year_group_id}:${row.subject_id}`;
      setSavingKey(key);
      try {
        await apiClient(`/api/v1/scheduling/exam-sessions/${sessionId}/subject-configs`, {
          method: 'PUT',
          body: JSON.stringify({
            year_group_id: row.year_group_id,
            subject_id: row.subject_id,
            is_examinable: row.is_examinable,
            paper_count: row.paper_count,
            paper_1_duration_mins: row.paper_1_duration_mins,
            paper_2_duration_mins: row.paper_2_duration_mins,
            mode: row.mode,
            invigilators_required: row.invigilators_required,
          }),
        });
        toast.success(t('rowUpdated'));
      } catch (err) {
        console.error('[SubjectMatrixTab]', err);
        toast.error(t('rowUpdateFailed'));
        void fetchRows();
      } finally {
        setSavingKey(null);
      }
    },
    [sessionId, fetchRows, t],
  );

  const updateRow = (key: string, patch: Partial<SubjectConfigRow>) => {
    setRows((prev) => {
      const next = prev.map((r) =>
        `${r.year_group_id}:${r.subject_id}` === key ? { ...r, ...patch } : r,
      );
      const updated = next.find((r) => `${r.year_group_id}:${r.subject_id}` === key);
      if (updated) void saveRow(updated);
      return next;
    });
  };

  const bulkSet = async (yearGroupId: string, examinable: boolean) => {
    const toUpsert = rows
      .filter((r) => r.year_group_id === yearGroupId)
      .map((r) => ({
        year_group_id: r.year_group_id,
        subject_id: r.subject_id,
        is_examinable: examinable,
        paper_count: r.paper_count,
        paper_1_duration_mins: r.paper_1_duration_mins,
        paper_2_duration_mins: r.paper_2_duration_mins,
        mode: r.mode,
        invigilators_required: r.invigilators_required,
      }));
    if (toUpsert.length === 0) return;
    try {
      await apiClient(`/api/v1/scheduling/exam-sessions/${sessionId}/subject-configs/bulk`, {
        method: 'POST',
        body: JSON.stringify({ configs: toUpsert }),
      });
      toast.success(t('bulkApplied'));
      void fetchRows();
    } catch (err) {
      console.error('[SubjectMatrixTab]', err);
      toast.error(t('rowUpdateFailed'));
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-12 text-center">
        <p className="text-sm text-text-secondary">{t('empty')}</p>
      </div>
    );
  }

  // Group by year group
  const byYearGroup = new Map<string, SubjectConfigRow[]>();
  for (const r of rows) {
    const list = byYearGroup.get(r.year_group_name) ?? [];
    list.push(r);
    byYearGroup.set(r.year_group_name, list);
  }

  return (
    <div className="space-y-6">
      {Array.from(byYearGroup.entries()).map(([ygName, ygRows]) => {
        const ygId = ygRows[0]?.year_group_id ?? '';
        return (
          <div key={ygName} className="rounded-2xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="text-base font-semibold text-text-primary">{ygName}</h3>
              {!readOnly && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void bulkSet(ygId, true)}>
                    {t('markAllExaminable')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void bulkSet(ygId, false)}>
                    {t('markNone')}
                  </Button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    {[
                      t('subject'),
                      t('studentCount'),
                      t('examinable'),
                      t('paperCount'),
                      t('paper1Duration'),
                      t('paper2Duration'),
                      t('mode'),
                      t('invigilatorsRequired'),
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-start text-xs font-semibold uppercase text-text-tertiary"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ygRows.map((r) => {
                    const key = `${r.year_group_id}:${r.subject_id}`;
                    const saving = savingKey === key;
                    return (
                      <tr key={key} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2 font-medium text-text-primary">
                          {r.subject_name}
                          {saving && (
                            <Loader2 className="inline-block h-3 w-3 animate-spin ms-2 text-text-tertiary" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{r.student_count}</td>
                        <td className="px-3 py-2">
                          <Switch
                            checked={r.is_examinable}
                            disabled={readOnly}
                            onCheckedChange={(checked) =>
                              updateRow(key, { is_examinable: checked })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={String(r.paper_count)}
                            onValueChange={(v) => updateRow(key, { paper_count: parseInt(v, 10) })}
                            disabled={readOnly || !r.is_examinable}
                          >
                            <SelectTrigger className="h-8 w-16">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={10}
                            max={480}
                            value={r.paper_1_duration_mins}
                            onChange={(e) =>
                              updateRow(key, {
                                paper_1_duration_mins: parseInt(e.target.value, 10) || 60,
                              })
                            }
                            disabled={readOnly || !r.is_examinable}
                            className="h-8 w-24"
                            dir="ltr"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={10}
                            max={480}
                            value={r.paper_2_duration_mins ?? ''}
                            onChange={(e) =>
                              updateRow(key, {
                                paper_2_duration_mins: e.target.value
                                  ? parseInt(e.target.value, 10)
                                  : null,
                              })
                            }
                            disabled={readOnly || !r.is_examinable || r.paper_count !== 2}
                            className="h-8 w-24"
                            dir="ltr"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={r.mode}
                            onValueChange={(v) =>
                              updateRow(key, { mode: v as 'in_person' | 'online' })
                            }
                            disabled={readOnly || !r.is_examinable}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="in_person">{t('inPerson')}</SelectItem>
                              <SelectItem value="online">{t('online')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            max={50}
                            value={r.invigilators_required}
                            onChange={(e) =>
                              updateRow(key, {
                                invigilators_required: parseInt(e.target.value, 10) || 1,
                              })
                            }
                            disabled={readOnly || !r.is_examinable}
                            className="h-8 w-20"
                            dir="ltr"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Invigilator Pool Tab ────────────────────────────────────────────────────

function InvigilatorPoolTab({ sessionId, readOnly }: { sessionId: string; readOnly: boolean }) {
  const t = useTranslations('scheduling.examSchedules.pool');
  const [pool, setPool] = React.useState<PoolMember[]>([]);
  const [staff, setStaff] = React.useState<PoolMember[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [poolRes, staffRes] = await Promise.all([
        apiClient<{ data: PoolMember[] }>(
          `/api/v1/scheduling/exam-sessions/${sessionId}/invigilator-pool`,
        ),
        apiClient<{
          data: Array<{ id: string; full_name: string; department: string | null }>;
        }>(`/api/v1/scheduling/teachers`),
      ]);
      const poolList = poolRes.data ?? [];
      setPool(poolList);
      setSelected(new Set(poolList.map((p) => p.staff_profile_id)));

      const teachers: PoolMember[] = (staffRes.data ?? []).map((s) => {
        const parts = s.full_name.split(' ');
        const first = parts[0] ?? '';
        const last = parts.slice(1).join(' ');
        return {
          staff_profile_id: s.id,
          first_name: first,
          last_name: last,
          email: '',
          job_title: s.department,
        };
      });
      setStaff(teachers);
    } catch (err) {
      console.error('[InvigilatorPoolTab]', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient(`/api/v1/scheduling/exam-sessions/${sessionId}/invigilator-pool`, {
        method: 'PUT',
        body: JSON.stringify({ staff_profile_ids: Array.from(selected) }),
      });
      toast.success(t('poolSaved'));
      void fetchAll();
    } catch (err) {
      console.error('[InvigilatorPoolTab]', err);
      toast.error(t('poolSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = staff.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
        ))}
      </div>
    );
  }

  if (staff.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-12 text-center">
        <p className="text-sm text-text-secondary">{t('noStaff')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 space-y-2">
        <h3 className="text-base font-semibold text-text-primary">{t('title')}</h3>
        <p className="text-sm text-text-secondary">{t('description')}</p>
      </div>

      <Input
        placeholder={t('searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      <div className="rounded-2xl border border-border bg-surface">
        <ul className="divide-y divide-border">
          {filtered.map((s) => {
            const checked = selected.has(s.staff_profile_id);
            return (
              <li key={s.staff_profile_id} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  id={`staff-${s.staff_profile_id}`}
                  checked={checked}
                  disabled={readOnly}
                  onCheckedChange={() => toggle(s.staff_profile_id)}
                />
                <label htmlFor={`staff-${s.staff_profile_id}`} className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium text-text-primary">
                    {s.first_name} {s.last_name}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {s.job_title ? `${s.job_title} · ` : ''}
                    {s.email}
                  </p>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-sm text-text-secondary">
            {selected.size} {t('selectedPool')}
            {pool.length > 0 && ` (saved: ${pool.length})`}
          </p>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin me-2" />
            ) : (
              <Save className="h-4 w-4 me-2" />
            )}
            {t('savePool')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Session Window Tab ──────────────────────────────────────────────────────

const DEFAULT_WINDOW: SessionConfig = {
  allowed_weekdays: [1, 2, 3, 4],
  morning_start: '09:00',
  morning_end: '12:30',
  afternoon_start: '13:30',
  afternoon_end: '16:30',
  min_gap_minutes_same_student: 60,
  max_exams_per_day_per_yg: 2,
};

function SessionWindowTab({ sessionId, readOnly }: { sessionId: string; readOnly: boolean }) {
  const t = useTranslations('scheduling.examSchedules.window');
  const [config, setConfig] = React.useState<SessionConfig>(DEFAULT_WINDOW);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data: SessionConfig | null } | SessionConfig | null>(
      `/api/v1/scheduling/exam-sessions/${sessionId}/config`,
    )
      .then((raw) => {
        // Server returns null when no config has been saved yet. `unwrap` keeps
        // the envelope when .data is null, so we peel it manually here and
        // treat a missing morning_start as "no config" — otherwise we'd wipe
        // DEFAULT_WINDOW with undefined and leave all inputs blank.
        const inner =
          raw && typeof raw === 'object' && 'data' in (raw as object)
            ? ((raw as { data: SessionConfig | null }).data ?? null)
            : (raw as SessionConfig | null);
        if (inner && typeof inner.morning_start === 'string' && inner.morning_start.length > 0) {
          setConfig({
            allowed_weekdays:
              inner.allowed_weekdays?.length > 0
                ? inner.allowed_weekdays
                : DEFAULT_WINDOW.allowed_weekdays,
            morning_start: inner.morning_start,
            morning_end: inner.morning_end,
            afternoon_start: inner.afternoon_start,
            afternoon_end: inner.afternoon_end,
            min_gap_minutes_same_student: inner.min_gap_minutes_same_student,
            max_exams_per_day_per_yg: inner.max_exams_per_day_per_yg,
          });
        }
      })
      .catch((err) => console.error('[SessionWindowTab]', err))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient(`/api/v1/scheduling/exam-sessions/${sessionId}/config`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      toast.success(t('saved'));
    } catch (err) {
      console.error('[SessionWindowTab]', err);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setConfig((prev) => {
      const next = new Set(prev.allowed_weekdays);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return { ...prev, allowed_weekdays: Array.from(next).sort((a, b) => a - b) };
    });
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-lg bg-surface-secondary" />;
  }

  const days = [
    { n: 0, key: 'sunday' as const },
    { n: 1, key: 'monday' as const },
    { n: 2, key: 'tuesday' as const },
    { n: 3, key: 'wednesday' as const },
    { n: 4, key: 'thursday' as const },
    { n: 5, key: 'friday' as const },
    { n: 6, key: 'saturday' as const },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-4 space-y-2">
        <h3 className="text-base font-semibold text-text-primary">{t('title')}</h3>
        <p className="text-sm text-text-secondary">{t('description')}</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">
        <div>
          <Label className="mb-2 block">{t('allowedWeekdays')}</Label>
          <div className="flex flex-wrap gap-2">
            {days.map((d) => {
              const active = config.allowed_weekdays.includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleDay(d.n)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-brand bg-brand text-brand-contrast'
                      : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
                  }`}
                >
                  {t(d.key)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('morningStart')}</Label>
            <Input
              type="time"
              value={config.morning_start}
              onChange={(e) => setConfig({ ...config, morning_start: e.target.value })}
              disabled={readOnly}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('morningEnd')}</Label>
            <Input
              type="time"
              value={config.morning_end}
              onChange={(e) => setConfig({ ...config, morning_end: e.target.value })}
              disabled={readOnly}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('afternoonStart')}</Label>
            <Input
              type="time"
              value={config.afternoon_start}
              onChange={(e) => setConfig({ ...config, afternoon_start: e.target.value })}
              disabled={readOnly}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('afternoonEnd')}</Label>
            <Input
              type="time"
              value={config.afternoon_end}
              onChange={(e) => setConfig({ ...config, afternoon_end: e.target.value })}
              disabled={readOnly}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('minGap')}</Label>
            <Input
              type="number"
              min={0}
              max={480}
              value={config.min_gap_minutes_same_student}
              onChange={(e) =>
                setConfig({
                  ...config,
                  min_gap_minutes_same_student: parseInt(e.target.value, 10) || 0,
                })
              }
              disabled={readOnly}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('maxPerDay')}</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={config.max_exams_per_day_per_yg}
              onChange={(e) =>
                setConfig({
                  ...config,
                  max_exams_per_day_per_yg: parseInt(e.target.value, 10) || 1,
                })
              }
              disabled={readOnly}
              dir="ltr"
            />
          </div>
        </div>

        {!readOnly && (
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : (
                <Save className="h-4 w-4 me-2" />
              )}
              {t('save')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Review & Publish Tab ────────────────────────────────────────────────────

interface Prereqs {
  examinable_count: number;
  pool_count: number;
  window_configured: boolean;
  max_invigilators_required: number;
}

// Group detailed slots by year group so the review page renders one card per
// year group instead of interleaving rows. Slots inside a group sort by date
// then start time; groups sort by year group name (stable, null-last).
function groupSlotsByYearGroup(
  slots: DetailedSlot[],
): Array<{ yearGroupId: string; yearGroupName: string; rows: DetailedSlot[] }> {
  const groups = new Map<string, { yearGroupName: string; rows: DetailedSlot[] }>();
  for (const s of slots) {
    const key = s.year_group_name ?? '__unknown__';
    const bucket = groups.get(key);
    if (bucket) {
      bucket.rows.push(s);
    } else {
      groups.set(key, { yearGroupName: s.year_group_name ?? '—', rows: [s] });
    }
  }

  const ordered = Array.from(groups.entries()).map(([id, g]) => {
    const rows = [...g.rows].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return a.start_time.localeCompare(b.start_time);
    });
    return { yearGroupId: id, yearGroupName: g.yearGroupName, rows };
  });

  ordered.sort((a, b) => {
    if (a.yearGroupId === '__unknown__') return 1;
    if (b.yearGroupId === '__unknown__') return -1;
    return a.yearGroupName.localeCompare(b.yearGroupName);
  });

  return ordered;
}

function ReviewTab({
  sessionId,
  session,
  onPublished,
}: {
  sessionId: string;
  session: ExamSession;
  onPublished: () => void;
}) {
  const t = useTranslations('scheduling.examSchedules.solve');
  const tPub = useTranslations('scheduling.examSchedules.publish');
  const tPre = useTranslations('scheduling.examSchedules.prereqs');
  const { snapshot: examSolveSnapshot, startTracking } = useExamSolverProgress();

  const [slots, setSlots] = React.useState<DetailedSlot[]>([]);
  const [prereqs, setPrereqs] = React.useState<Prereqs | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [solving, setSolving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [slotsRes, matrixRes, poolRes, configRaw] = await Promise.all([
        apiClient<{ data: DetailedSlot[] }>(
          `/api/v1/scheduling/exam-sessions/${sessionId}/slots-detailed`,
        ),
        apiClient<{ data: SubjectConfigRow[] }>(
          `/api/v1/scheduling/exam-sessions/${sessionId}/subject-configs`,
        ),
        apiClient<{ data: PoolMember[] }>(
          `/api/v1/scheduling/exam-sessions/${sessionId}/invigilator-pool`,
        ),
        apiClient<{ data: SessionConfig | null } | SessionConfig | null>(
          `/api/v1/scheduling/exam-sessions/${sessionId}/config`,
        ),
      ]);
      setSlots(slotsRes.data ?? []);
      const matrix = matrixRes.data ?? [];
      const examinable = matrix.filter((r) => r.is_examinable);
      // Peel envelope manually — unwrap keeps { data: null } wrappers.
      const config =
        configRaw && typeof configRaw === 'object' && 'data' in (configRaw as object)
          ? ((configRaw as { data: SessionConfig | null }).data ?? null)
          : (configRaw as SessionConfig | null);
      setPrereqs({
        examinable_count: examinable.length,
        pool_count: (poolRes.data ?? []).length,
        window_configured:
          !!config && Array.isArray(config.allowed_weekdays) && config.allowed_weekdays.length > 0,
        max_invigilators_required: examinable.reduce(
          (max, r) => Math.max(max, r.invigilators_required),
          0,
        ),
      });
    } catch (err) {
      console.error('[ReviewTab]', err);
      setSlots([]);
      setPrereqs(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // When a solve we started (or resumed) finishes, refetch slots so the
  // review grid updates without requiring a manual reload.
  const lastSeenTerminalRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!examSolveSnapshot || examSolveSnapshot.sessionId !== sessionId) return;
    const isTerminal =
      examSolveSnapshot.status === 'completed' ||
      examSolveSnapshot.status === 'failed' ||
      examSolveSnapshot.status === 'cancelled';
    if (!isTerminal) return;
    if (lastSeenTerminalRef.current === examSolveSnapshot.jobId) return;
    lastSeenTerminalRef.current = examSolveSnapshot.jobId;
    void fetchAll();
  }, [examSolveSnapshot, sessionId, fetchAll]);

  const solve = async () => {
    setSolving(true);
    try {
      const raw = await apiClient<{ data: EnqueueSolveResponse } | EnqueueSolveResponse>(
        `/api/v1/scheduling/exam-sessions/${sessionId}/solve`,
        { method: 'POST', body: JSON.stringify({ max_solver_duration_seconds: 450 }) },
      );
      const res = unwrap(raw) as EnqueueSolveResponse;
      // Hand off to the global progress provider — the bottom-right widget
      // polls from here and stays mounted across navigation so leaving this
      // page doesn't cancel the solve.
      startTracking(res.solve_job_id, sessionId);
      toast.success(t('enqueued'));
    } catch (err: unknown) {
      console.error('[ReviewTab]', err);
      const ex = err as { error?: { message?: string } };
      toast.error(ex?.error?.message ?? t('error'));
    } finally {
      setSolving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      await apiClient(`/api/v1/scheduling/exam-sessions/${sessionId}/publish-v2`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      });
      toast.success(tPub('succeeded'));
      setPublishOpen(false);
      onPublished();
    } catch (err: unknown) {
      console.error('[ReviewTab]', err);
      const ex = err as { error?: { message?: string } };
      toast.error(ex?.error?.message ?? tPub('failed'));
    } finally {
      setPublishing(false);
    }
  };

  const activeSolveForThisSession =
    !!examSolveSnapshot &&
    examSolveSnapshot.sessionId === sessionId &&
    (examSolveSnapshot.status === 'queued' ||
      examSolveSnapshot.status === 'running' ||
      examSolveSnapshot.status === 'unknown');

  const matrixReady = (prereqs?.examinable_count ?? 0) > 0;
  const poolReady =
    !!prereqs && prereqs.pool_count > 0 && prereqs.pool_count >= prereqs.max_invigilators_required;
  const windowReady = prereqs?.window_configured ?? false;
  const allPrereqsMet = matrixReady && poolReady && windowReady;

  const canPublish = session.status === 'planning' && slots.length > 0;
  const isDraft = session.status === 'planning' && slots.length > 0;

  return (
    <div className="space-y-6">
      {/* Prerequisites checklist */}
      {session.status === 'planning' && (
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">{tPre('title')}</h3>
            <p className="mt-1 text-sm text-text-secondary">{tPre('description')}</p>
          </div>
          <ul className="space-y-2">
            <PrereqItem
              met={matrixReady}
              label={tPre('matrix', { count: prereqs?.examinable_count ?? 0 })}
              hint={tPre('matrixHint')}
            />
            <PrereqItem
              met={poolReady}
              label={tPre('pool', {
                count: prereqs?.pool_count ?? 0,
                required: prereqs?.max_invigilators_required ?? 0,
              })}
              hint={tPre('poolHint')}
            />
            <PrereqItem
              met={windowReady}
              label={windowReady ? tPre('windowOk') : tPre('windowMissing')}
              hint={tPre('windowHint')}
            />
          </ul>
        </div>
      )}

      {/* Generate section */}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{t('title')}</h3>
          <p className="mt-1 text-sm text-text-secondary">{t('description')}</p>
        </div>
        {session.status === 'planning' && (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void solve()}
              disabled={solving || !allPrereqsMet || activeSolveForThisSession}
              title={
                activeSolveForThisSession
                  ? t('alreadyRunningHint')
                  : !allPrereqsMet
                    ? tPre('blockedTooltip')
                    : undefined
              }
            >
              {solving || activeSolveForThisSession ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : (
                <Sparkles className="h-4 w-4 me-2" />
              )}
              {slots.length > 0 ? t('regenerate') : t('generate')}
            </Button>
            {activeSolveForThisSession ? (
              <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('runningHint')}
              </span>
            ) : !allPrereqsMet ? (
              <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <AlertCircle className="h-3.5 w-3.5" />
                {tPre('blocked')}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Draft / published banner */}
      {isDraft && (
        <div className="rounded-2xl border border-brand/40 bg-brand/5 p-4 flex items-start gap-3">
          <ClipboardList className="h-5 w-5 text-brand mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-text-primary">{tPub('draftTitle')}</p>
            <p className="text-text-secondary mt-0.5">{tPub('draftDescription')}</p>
          </div>
        </div>
      )}

      {/* Slots — header + Publish action, then one card per year group */}
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="text-sm font-semibold text-text-primary">{t('slotsTable')}</h3>
        {canPublish && (
          <Button onClick={() => setPublishOpen(true)} disabled={publishing}>
            <Send className="h-4 w-4 me-2" />
            {tPub('button')}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-surface-secondary" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-12 text-center text-sm text-text-secondary">
          {t('noSlots')}
        </div>
      ) : (
        <div className="space-y-4">
          {groupSlotsByYearGroup(slots).map(({ yearGroupId, yearGroupName, rows }) => (
            <div key={yearGroupId} className="rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h4 className="text-base font-semibold text-text-primary">{yearGroupName}</h4>
                <span className="text-xs text-text-tertiary">
                  {t('groupExamCount', { count: rows.length })}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      {[
                        t('slotsColDate'),
                        t('slotsColTime'),
                        t('slotsColSubject'),
                        t('slotsColPaper'),
                        t('slotsColStudents'),
                        t('slotsColRooms'),
                        t('slotsColInvigilators'),
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-start text-xs font-semibold uppercase text-text-tertiary"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2 text-text-secondary">
                          {new Date(s.date).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-text-secondary font-mono text-xs" dir="ltr">
                          {s.start_time} – {s.end_time}
                        </td>
                        <td className="px-3 py-2 font-medium text-text-primary">
                          {s.subject_name ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {s.paper_number ? `P${s.paper_number}` : t('singlePaper')}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{s.student_count}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {s.rooms.length === 0 ? '—' : s.rooms.map((r) => r.room_name).join(', ')}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {s.invigilators.length === 0
                            ? '—'
                            : s.invigilators.map((i) => i.name).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tPub('confirmTitle')}</DialogTitle>
            <DialogDescription>{tPub('confirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)} disabled={publishing}>
              {tPub('cancel')}
            </Button>
            <Button onClick={() => void publish()} disabled={publishing}>
              {publishing && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {tPub('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PrereqItem({ met, label, hint }: { met: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {met ? (
        <CheckCircle2 className="h-4 w-4 text-success-fg mt-0.5 shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-text-tertiary mt-0.5 shrink-0" />
      )}
      <div className="flex-1">
        <p className={met ? 'text-text-primary' : 'text-text-secondary'}>{label}</p>
        {!met && <p className="text-xs text-text-tertiary mt-0.5">{hint}</p>}
      </div>
    </li>
  );
}
