'use client';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface StaffMember {
  id: string;
  name: string; // derived from user.first_name + user.last_name
}

interface DayEntry {
  weekday: number;
  from_time: string;
  to_time: string;
}



// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const; // Mon–Sat (school days)
const WEEKDAY_LABELS: Record<number, string> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

const DEFAULT_FROM = '07:30';
const DEFAULT_TO = '15:30';

// ─── Day Row ──────────────────────────────────────────────────────────────────

interface DayRowProps {
  weekday: number;
  label: string;
  entry: DayEntry | undefined;
  onChange: (weekday: number, field: 'from_time' | 'to_time', value: string) => void;
  onToggle: (weekday: number, enabled: boolean) => void;
}

function DayRow({ weekday, label, entry, onChange, onToggle }: DayRowProps) {
  const isEnabled = !!entry;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors ${
        isEnabled ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-border bg-surface-secondary'
      }`}
    >
      <button
        className={`h-5 w-5 shrink-0 rounded border-2 transition-colors ${
          isEnabled ? 'border-green-500 bg-green-500 dark:border-green-400 dark:bg-green-400' : 'border-border bg-canvas'
        }`}
        onClick={() => onToggle(weekday, !isEnabled)}
        aria-label={isEnabled ? 'Disable' : 'Enable'}
      />
      <span className="w-24 shrink-0 text-sm font-medium text-text-primary">{label}</span>

      {isEnabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-text-secondary">From</Label>
            <Input
              type="time"
              value={entry.from_time}
              onChange={(e) => onChange(weekday, 'from_time', e.target.value)}
              className="h-7 w-28 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-text-secondary">To</Label>
            <Input
              type="time"
              value={entry.to_time}
              onChange={(e) => onChange(weekday, 'to_time', e.target.value)}
              className="h-7 w-28 text-xs"
            />
          </div>
        </div>
      ) : (
        <span className="text-xs text-text-tertiary">Not available</span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const t = useTranslations('scheduling');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [staff, setStaff] = React.useState<StaffMember[]>([]);
  const [search, setSearch] = React.useState('');
  const [selectedStaff, setSelectedStaff] = React.useState('');

  const [entries, setEntries] = React.useState<DayEntry[]>([]);
  const [, setRecordId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load reference data
  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: Array<{ id: string; user: { first_name: string; last_name: string } }> }>('/api/v1/staff-profiles?pageSize=100'),
    ])
      .then(([yearsRes, staffRes]) => {
        setAcademicYears(yearsRes.data);
        setStaff((staffRes.data ?? []).map((s) => ({
          id: s.id,
          name: s.user ? `${s.user.first_name} ${s.user.last_name}` : s.id,
        })));
        if (yearsRes.data.length > 0 && yearsRes.data[0]) {
          setSelectedYear(yearsRes.data[0].id);
        }
      })
      .catch(() => toast.error('Failed to load reference data'));
  }, []);

  // Load availability when staff + year selected
  React.useEffect(() => {
    if (!selectedStaff || !selectedYear) return;
    setIsLoading(true);
    apiClient<Array<{ id: string; weekday: number; available_from: string; available_to: string }> | { data: Array<{ id: string; weekday: number; available_from: string; available_to: string }> }>(
      `/api/v1/staff-availability?staff_profile_id=${selectedStaff}&academic_year_id=${selectedYear}`,
    )
      .then((res) => {
        const records = Array.isArray(res) ? res : (res.data ?? []);
        setEntries(records.map((r) => ({
          weekday: r.weekday,
          from_time: r.available_from,
          to_time: r.available_to,
        })));
        setRecordId(records[0]?.id ?? null);
      })
      .catch(() => {
        setEntries([]);
        setRecordId(null);
      })
      .finally(() => setIsLoading(false));
  }, [selectedStaff, selectedYear]);

  const handleToggle = (weekday: number, enabled: boolean) => {
    setEntries((prev) => {
      if (enabled) {
        return [...prev, { weekday, from_time: DEFAULT_FROM, to_time: DEFAULT_TO }];
      }
      return prev.filter((e) => e.weekday !== weekday);
    });
  };

  const handleChange = (weekday: number, field: 'from_time' | 'to_time', value: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.weekday === weekday ? { ...e, [field]: value } : e)),
    );
  };

  const handleSave = async () => {
    if (!selectedStaff || !selectedYear) return;
    setIsSaving(true);
    try {
      await apiClient(`/api/v1/staff-availability/staff/${selectedStaff}/year/${selectedYear}`, {
        method: 'PUT',
        body: JSON.stringify({
          entries: entries.map((e) => ({
            weekday: e.weekday,
            available_from: e.from_time,
            available_to: e.to_time,
          })),
        }),
      });
      toast.success('Availability saved');
    } catch {
      toast.error('Failed to save availability');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setEntries([]);
  };

  const filteredStaff = staff.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedMember = staff.find((s) => s.id === selectedStaff);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('auto.availability')}
        description={t('auto.availabilityDesc')}
      />

      <div className="flex flex-col gap-6 sm:flex-row">
        {/* Staff list */}
        <div className="w-full sm:w-56 sm:shrink-0">
          <div className="relative mb-2">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-text-tertiary" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff…"
              className="ps-8 text-sm"
            />
          </div>
          <div className="max-h-[500px] overflow-y-auto rounded-lg border border-border">
            {filteredStaff.map((s) => (
              <button
                key={s.id}
                className={`w-full px-3 py-2.5 text-start text-sm transition-colors hover:bg-surface-secondary ${
                  s.id === selectedStaff
                    ? 'bg-primary/5 font-medium text-primary'
                    : 'text-text-primary'
                }`}
                onClick={() => setSelectedStaff(s.id)}
              >
                {s.name}
              </button>
            ))}
            {filteredStaff.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-text-tertiary">
                No staff found
              </div>
            )}
          </div>
        </div>

        {/* Availability grid */}
        <div className="flex-1">
          {!selectedStaff ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-text-tertiary">
              Select a staff member to configure availability
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {WEEKDAYS.map((d) => (
                <div key={d} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    {selectedMember?.name}
                  </span>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="h-7 w-full sm:w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map((y) => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleClear}>
                    Clear all
                  </Button>
                  <Button size="sm" onClick={() => void handleSave()} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {WEEKDAYS.map((weekday) => (
                  <DayRow
                    key={weekday}
                    weekday={weekday}
                    label={t(WEEKDAY_LABELS[weekday])}
                    entry={entries.find((e) => e.weekday === weekday)}
                    onChange={handleChange}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
