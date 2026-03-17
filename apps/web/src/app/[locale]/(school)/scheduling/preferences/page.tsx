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

interface StaffOption {
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
}

type PreferenceKind = 'subject' | 'class' | 'time_slot';
type PreferenceSentiment = 'prefer' | 'avoid';

interface Preference {
  id: string;
  staff_profile_id: string;
  academic_year_id: string;
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

// ─── Tab content ─────────────────────────────────────────────────────────────

interface TabPanelProps {
  kind: PreferenceKind;
  preferences: Preference[];
  subjects: SubjectOption[];
  classes: ClassOption[];
  periodSlots: PeriodSlot[];
  onAdd: (kind: PreferenceKind, entityId: string, sentiment: PreferenceSentiment) => void;
  onDelete: (id: string) => void;
  onChangeSentiment: (id: string, sentiment: PreferenceSentiment) => void;
  onChangePriority: (id: string, priority: number) => void;
}

function PreferenceTabPanel({
  kind,
  preferences,
  subjects,
  classes,
  periodSlots,
  onAdd,
  onDelete,
  onChangeSentiment,
  onChangePriority,
}: TabPanelProps) {
  const [newEntityId, setNewEntityId] = React.useState('');
  const [newSentiment, setNewSentiment] = React.useState<PreferenceSentiment>('prefer');

  const kindPrefs = preferences.filter((p) => p.preference_type === kind);

  const entityOptions = () => {
    switch (kind) {
      case 'subject':
        return subjects.map((s) => ({ id: s.id, label: s.name }));
      case 'class':
        return classes.map((c) => ({ id: c.id, label: c.name }));
      case 'time_slot':
        return periodSlots.map((p) => ({
          id: p.id,
          label: `${p.name} (Day ${p.weekday} ${p.start_time})`,
        }));
    }
  };

  const getEntityLabel = (pref: Preference) => {
    switch (kind) {
      case 'subject':
        return pref.subject?.name ?? '—';
      case 'class':
        return pref.class?.name ?? '—';
      case 'time_slot':
        return pref.period_slot?.name ?? '—';
    }
  };

  return (
    <div className="space-y-4">
      {/* Add row */}
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3">
        <Select value={newEntityId} onValueChange={setNewEntityId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={`Select ${kind.replace('_', ' ')}…`} />
          </SelectTrigger>
          <SelectContent>
            {entityOptions().map((opt) => (
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
        <Button
          size="sm"
          disabled={!newEntityId}
          onClick={() => {
            if (!newEntityId) return;
            onAdd(kind, newEntityId, newSentiment);
            setNewEntityId('');
          }}
        >
          <Plus className="me-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Preference list */}
      {kindPrefs.length === 0 ? (
        <div className="rounded-lg border border-border py-8 text-center text-sm text-text-tertiary">
          No {kind.replace('_', ' ')} preferences set
        </div>
      ) : (
        <div className="space-y-2">
          {kindPrefs.map((pref) => (
            <div
              key={pref.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
            >
              <span className="flex-1 text-sm text-text-primary">{getEntityLabel(pref)}</span>
              <Badge
                variant={pref.sentiment === 'prefer' ? 'default' : 'outline'}
                className={`cursor-pointer text-xs capitalize ${
                  pref.sentiment === 'avoid' ? 'border-red-300 text-red-600' : ''
                }`}
                onClick={() =>
                  onChangeSentiment(pref.id, pref.sentiment === 'prefer' ? 'avoid' : 'prefer')
                }
              >
                {pref.sentiment}
              </Badge>
              <Select
                value={String(pref.priority)}
                onValueChange={(v) => onChangePriority(pref.id, parseInt(v, 10))}
              >
                <SelectTrigger className="h-7 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Low</SelectItem>
                  <SelectItem value="2">Medium</SelectItem>
                  <SelectItem value="3">High</SelectItem>
                </SelectContent>
              </Select>
              <button
                className="rounded p-1 text-text-tertiary hover:bg-red-50 hover:text-red-500"
                onClick={() => onDelete(pref.id)}
                aria-label="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TAB_KINDS: PreferenceKind[] = ['subject', 'class', 'time_slot'];

export default function PreferencesPage() {
  const t = useTranslations('scheduling');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [staff, setStaff] = React.useState<StaffOption[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [periodSlots, setPeriodSlots] = React.useState<PeriodSlot[]>([]);

  const [selectedStaff, setSelectedStaff] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<PreferenceKind>('subject');
  const [preferences, setPreferences] = React.useState<Preference[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: StaffOption[] }>('/api/v1/staff-profiles?pageSize=200'),
      apiClient<{ data: SubjectOption[] }>('/api/v1/subjects?pageSize=200'),
      apiClient<{ data: ClassOption[] }>('/api/v1/classes?pageSize=200'),
    ])
      .then(([yearsRes, staffRes, subjectsRes, classesRes]) => {
        setAcademicYears(yearsRes.data);
        setStaff(staffRes.data);
        setSubjects(subjectsRes.data);
        setClasses(classesRes.data);
        if (yearsRes.data.length > 0 && yearsRes.data[0]) {
          setSelectedYear(yearsRes.data[0].id);
        }
      })
      .catch(() => toast.error('Failed to load reference data'));
  }, []);

  // Load period slots when year is selected
  React.useEffect(() => {
    if (!selectedYear) return;
    apiClient<{ data: PeriodSlot[] }>(`/api/v1/period-grid?academic_year_id=${selectedYear}`)
      .then((res) => setPeriodSlots(res.data.filter((p) => p.period_type === 'teaching') as PeriodSlot[]))
      .catch(() => undefined);
  }, [selectedYear]);

  // Load preferences when staff + year selected
  React.useEffect(() => {
    if (!selectedStaff || !selectedYear) return;
    setIsLoading(true);
    apiClient<PreferencesResponse>(
      `/api/v1/staff-preferences?staff_profile_id=${selectedStaff}&academic_year_id=${selectedYear}&pageSize=100`,
    )
      .then((res) => setPreferences(res.data))
      .catch(() => {
        setPreferences([]);
        toast.error('Failed to load preferences');
      })
      .finally(() => setIsLoading(false));
  }, [selectedStaff, selectedYear]);

  const handleAdd = async (
    kind: PreferenceKind,
    entityId: string,
    sentiment: PreferenceSentiment,
  ) => {
    const payload: Record<string, unknown> = {
      staff_profile_id: selectedStaff,
      academic_year_id: selectedYear,
      preference_type: kind,
      sentiment,
      priority: 2,
    };
    if (kind === 'subject') payload['subject_id'] = entityId;
    if (kind === 'class') payload['class_id'] = entityId;
    if (kind === 'time_slot') payload['period_slot_id'] = entityId;

    try {
      const created = await apiClient<Preference>('/api/v1/staff-preferences', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setPreferences((prev) => [...prev, created]);
    } catch {
      toast.error('Failed to add preference');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/staff-preferences/${id}`, { method: 'DELETE' });
      setPreferences((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error('Failed to delete preference');
    }
  };

  const handleChangeSentiment = async (id: string, sentiment: PreferenceSentiment) => {
    try {
      const updated = await apiClient<Preference>(`/api/v1/staff-preferences/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sentiment }),
      });
      setPreferences((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch {
      toast.error('Failed to update preference');
    }
  };

  const handleChangePriority = async (id: string, priority: number) => {
    try {
      const updated = await apiClient<Preference>(`/api/v1/staff-preferences/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      setPreferences((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch {
      toast.error('Failed to update preference');
    }
  };

  const TAB_LABELS: Record<PreferenceKind, string> = {
    subject: 'Subject',
    class: 'Class',
    time_slot: 'Time Slot',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('auto.preferences')}
        description={t('auto.preferencesDesc')}
        actions={
          <div className="flex items-center gap-3">
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
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Select staff member…" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Best-effort banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Preferences are best-effort. The scheduler will try to honour them but may not always be
          able to satisfy all preferences when constraints conflict.
        </span>
      </div>

      {!selectedStaff ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-text-tertiary">
          Select a staff member to manage preferences
        </div>
      ) : isLoading ? (
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
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === kind
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => setActiveTab(kind)}
                >
                  {TAB_LABELS[kind]}
                  {count > 0 && (
                    <Badge variant="outline" className="h-5 min-w-5 justify-center px-1 text-xs">
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-4">
            <PreferenceTabPanel
              kind={activeTab}
              preferences={preferences}
              subjects={subjects}
              classes={classes}
              periodSlots={periodSlots}
              onAdd={handleAdd}
              onDelete={handleDelete}
              onChangeSentiment={handleChangeSentiment}
              onChangePriority={handleChangePriority}
            />
          </div>
        </div>
      )}
    </div>
  );
}
