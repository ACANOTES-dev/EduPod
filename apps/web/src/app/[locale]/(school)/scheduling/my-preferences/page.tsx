'use client';

import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface SubjectOption {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
}

interface PeriodSlot {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  period_type: string;
}

type PreferenceKind = 'subject' | 'class' | 'time_slot';
type PreferenceSentiment = 'prefer' | 'avoid';

interface Preference {
  id: string;
  preference_type: PreferenceKind;
  sentiment: PreferenceSentiment;
  priority: number;
  subject_id: string | null;
  class_id: string | null;
  period_slot_id: string | null;
  subject?: { id: string; name: string } | null;
  class?: { id: string; name: string } | null;
  period_slot?: { id: string; name: string } | null;
}

interface PreferencesResponse {
  data: Preference[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TAB_KINDS: PreferenceKind[] = ['subject', 'class', 'time_slot'];
const TAB_LABELS: Record<PreferenceKind, string> = {
  subject: 'Subject',
  class: 'Class',
  time_slot: 'Time Slot',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyPreferencesPage() {
  const t = useTranslations('scheduling');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [periodSlots, setPeriodSlots] = React.useState<PeriodSlot[]>([]);

  const [activeTab, setActiveTab] = React.useState<PreferenceKind>('subject');
  const [preferences, setPreferences] = React.useState<Preference[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Add form state per tab
  const [newEntityId, setNewEntityId] = React.useState('');
  const [newSentiment, setNewSentiment] = React.useState<PreferenceSentiment>('prefer');

  // Load reference data on mount
  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: SubjectOption[] }>('/api/v1/subjects?pageSize=200'),
      apiClient<{ data: ClassOption[] }>('/api/v1/classes?pageSize=200'),
    ])
      .then(([yearsRes, subjectsRes, classesRes]) => {
        setAcademicYears(yearsRes.data);
        setSubjects(subjectsRes.data);
        setClasses(classesRes.data);
        if (yearsRes.data.length > 0 && yearsRes.data[0]) {
          setSelectedYear(yearsRes.data[0].id);
        }
      })
      .catch(() => toast.error('Failed to load data'));
  }, []);

  // Load period slots when year changes
  React.useEffect(() => {
    if (!selectedYear) return;
    apiClient<{ data: PeriodSlot[] }>(`/api/v1/period-grid?academic_year_id=${selectedYear}`)
      .then((res) =>
        setPeriodSlots(res.data.filter((p) => p.period_type === 'teaching')),
      )
      .catch(() => undefined);
  }, [selectedYear]);

  // Load own preferences when year changes
  React.useEffect(() => {
    if (!selectedYear) return;
    setIsLoading(true);
    apiClient<PreferencesResponse>(
      `/api/v1/staff-preferences/own?academic_year_id=${selectedYear}&pageSize=100`,
    )
      .then((res) => setPreferences(res.data))
      .catch(() => {
        setPreferences([]);
        toast.error('Failed to load preferences');
      })
      .finally(() => setIsLoading(false));
  }, [selectedYear]);

  // Reset add form when tab changes
  React.useEffect(() => {
    setNewEntityId('');
    setNewSentiment('prefer');
  }, [activeTab]);

  const entityOptions = (kind: PreferenceKind) => {
    switch (kind) {
      case 'subject':
        return subjects.map((s) => ({ id: s.id, label: s.name }));
      case 'class':
        return classes.map((c) => ({ id: c.id, label: c.name }));
      case 'time_slot':
        return periodSlots.map((p) => ({
          id: p.id,
          label: `${p.name} (Day ${p.weekday}, ${p.start_time})`,
        }));
    }
  };

  const getEntityLabel = (pref: Preference, kind: PreferenceKind) => {
    switch (kind) {
      case 'subject':
        return pref.subject?.name ?? '—';
      case 'class':
        return pref.class?.name ?? '—';
      case 'time_slot':
        return pref.period_slot?.name ?? '—';
    }
  };

  const handleAdd = async () => {
    if (!newEntityId || !selectedYear) return;
    const payload: Record<string, unknown> = {
      academic_year_id: selectedYear,
      preference_type: activeTab,
      sentiment: newSentiment,
      priority: 2,
    };
    if (activeTab === 'subject') payload['subject_id'] = newEntityId;
    if (activeTab === 'class') payload['class_id'] = newEntityId;
    if (activeTab === 'time_slot') payload['period_slot_id'] = newEntityId;

    try {
      const created = await apiClient<Preference>('/api/v1/staff-preferences/own', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setPreferences((prev) => [...prev, created]);
      setNewEntityId('');
    } catch {
      toast.error('Failed to add preference');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/staff-preferences/own/${id}`, { method: 'DELETE' });
      setPreferences((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error('Failed to delete preference');
    }
  };

  const handleToggleSentiment = async (id: string, current: PreferenceSentiment) => {
    const next = current === 'prefer' ? 'avoid' : 'prefer';
    try {
      const updated = await apiClient<Preference>(`/api/v1/staff-preferences/own/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sentiment: next }),
      });
      setPreferences((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch {
      toast.error('Failed to update preference');
    }
  };

  const handleChangePriority = async (id: string, priority: number) => {
    try {
      const updated = await apiClient<Preference>(`/api/v1/staff-preferences/own/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      setPreferences((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch {
      toast.error('Failed to update preference');
    }
  };

  const tabPrefs = preferences.filter((p) => p.preference_type === activeTab);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('auto.myPreferences')}
        description={t('auto.myPreferencesDesc')}
        actions={
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Academic Year" />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          These preferences are best-effort. The scheduler will try to honour them but cannot
          guarantee satisfaction when they conflict with other constraints or teacher assignments.
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          {/* Tabs */}
          <div className="flex border-b border-border">
            {TAB_KINDS.map((kind) => {
              const count = preferences.filter((p) => p.preference_type === kind).length;
              return (
                <button
                  key={kind}
                  className={`flex items-center gap-2 border-b-2 -mb-px px-5 py-3 text-sm font-medium transition-colors ${
                    activeTab === kind
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => setActiveTab(kind)}
                >
                  {TAB_LABELS[kind]}
                  {count > 0 && (
                    <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1 text-xs">
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-4 p-4">
            {/* Add row */}
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3">
              <Select value={newEntityId} onValueChange={setNewEntityId}>
                <SelectTrigger className="w-56">
                  <SelectValue
                    placeholder={`Select ${TAB_LABELS[activeTab].toLowerCase()}…`}
                  />
                </SelectTrigger>
                <SelectContent>
                  {entityOptions(activeTab).map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={newSentiment}
                onValueChange={(v) => setNewSentiment(v as PreferenceSentiment)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prefer">Prefer</SelectItem>
                  <SelectItem value="avoid">Avoid</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!newEntityId} onClick={() => void handleAdd()}>
                <Plus className="me-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            {/* Preference list */}
            {tabPrefs.length === 0 ? (
              <div className="rounded-lg border border-border py-8 text-center text-sm text-text-tertiary">
                No {TAB_LABELS[activeTab].toLowerCase()} preferences set
              </div>
            ) : (
              <div className="space-y-2">
                {tabPrefs.map((pref) => (
                  <div
                    key={pref.id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                  >
                    <span className="flex-1 text-sm text-text-primary">
                      {getEntityLabel(pref, activeTab)}
                    </span>
                    <Badge
                      variant={pref.sentiment === 'prefer' ? 'default' : 'secondary'}
                      className={`cursor-pointer select-none text-xs capitalize ${
                        pref.sentiment === 'avoid' ? 'border-red-300 text-red-600' : ''
                      }`}
                      onClick={() => void handleToggleSentiment(pref.id, pref.sentiment)}
                    >
                      {pref.sentiment}
                    </Badge>
                    <Select
                      value={String(pref.priority)}
                      onValueChange={(v) => void handleChangePriority(pref.id, parseInt(v, 10))}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      className="rounded p-1 text-text-tertiary hover:bg-red-50 hover:text-red-500"
                      onClick={() => void handleDelete(pref.id)}
                      aria-label="Remove preference"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
