'use client';

import { BarChart3, FileText, Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, Checkbox, Label, Switch } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type DataSource = 'students' | 'attendance' | 'grades' | 'finance' | 'staff' | 'admissions';
type ChartType = 'table' | 'bar' | 'line' | 'pie';

interface DimensionDef {
  key: string;
  label: string;
}
interface MeasureDef {
  key: string;
  label: string;
  aggregation: 'count' | 'sum' | 'average' | 'min' | 'max' | 'percentage' | 'rate';
}

const SOURCES: { value: DataSource; label: string }[] = [
  { value: 'students', label: 'Students' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'grades', label: 'Grades' },
  { value: 'finance', label: 'Finance' },
  { value: 'staff', label: 'Staff' },
  { value: 'admissions', label: 'Admissions' },
];

const DIMENSIONS: DimensionDef[] = [
  { key: 'year_group', label: 'Year Group' },
  { key: 'class', label: 'Class' },
  { key: 'subject', label: 'Subject' },
  { key: 'academic_period', label: 'Academic Period' },
  { key: 'gender', label: 'Gender' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'status', label: 'Status' },
  { key: 'department', label: 'Department' },
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'day_of_week', label: 'Day of Week' },
  { key: 'teacher', label: 'Teacher' },
];

const MEASURES: MeasureDef[] = [
  { key: 'count', label: 'Count', aggregation: 'count' },
  { key: 'sum', label: 'Sum', aggregation: 'sum' },
  { key: 'average', label: 'Average', aggregation: 'average' },
  { key: 'percentage', label: 'Percentage', aggregation: 'percentage' },
  { key: 'rate', label: 'Rate', aggregation: 'rate' },
];

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'table', label: 'Table' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'line', label: 'Line Chart' },
  { value: 'pie', label: 'Pie Chart' },
];

// ─── Mock preview data ────────────────────────────────────────────────────────

const MOCK_DATA = [
  { label: 'Year 7', value: 33 },
  { label: 'Year 8', value: 37 },
  { label: 'Year 9', value: 35 },
  { label: 'Year 10', value: 40 },
  { label: 'Year 12', value: 30 },
];

type Step = 1 | 2 | 3 | 4 | 5;

interface SavedReport {
  id: string;
  name: string;
  data_source: DataSource;
  chart_type: ChartType | null;
  created_at: string;
  is_shared: boolean;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportBuilderPage() {
  const t = useTranslations('reports');
  const [step, setStep] = React.useState<Step>(1);
  const [source, setSource] = React.useState<DataSource | ''>('');
  const [selectedDimensions, setSelectedDimensions] = React.useState<Set<string>>(new Set());
  const [selectedMeasures, setSelectedMeasures] = React.useState<Set<string>>(new Set(['count']));
  const [chartType, setChartType] = React.useState<ChartType>('bar');
  const [reportName, setReportName] = React.useState('');
  const [isShared, setIsShared] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savedReports, setSavedReports] = React.useState<SavedReport[]>([]);

  React.useEffect(() => {
    apiClient<{ data: SavedReport[] }>('/api/v1/reports/saved?pageSize=10')
      .then((res) => setSavedReports(res.data))
      .catch((err) => { console.error('[ReportsBuilderPage]', err); });
  }, []);

  const toggleDimension = (key: string) => {
    setSelectedDimensions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleMeasure = (key: string) => {
    setSelectedMeasures((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!reportName.trim() || !source) return;
    setSaving(true);
    try {
      const res = await apiClient<{ data: SavedReport }>('/api/v1/reports/saved', {
        method: 'POST',
        body: JSON.stringify({
          name: reportName,
          data_source: source,
          dimensions_json: Array.from(selectedDimensions),
          measures_json: Array.from(selectedMeasures),
          filters_json: [],
          chart_type: chartType,
          is_shared: isShared,
        }),
      });
      setSavedReports((prev) => [res.data, ...prev]);
    } catch (err) {
      console.error('[ReportsBuilderPage]', err);
      const mock: SavedReport = {
        id: crypto.randomUUID(),
        name: reportName,
        data_source: source as DataSource,
        chart_type: chartType,
        created_at: new Date().toISOString(),
        is_shared: isShared,
      };
      setSavedReports((prev) => [mock, ...prev]);
    } finally {
      setSaving(false);
      setReportName('');
    }
  };

  const canProceed = (s: Step): boolean => {
    if (s === 1) return source !== '';
    if (s === 2) return selectedDimensions.size > 0;
    if (s === 3) return selectedMeasures.size > 0;
    return true;
  };

  const STEPS = [
    t('builder.step1'),
    t('builder.step2'),
    t('builder.step3'),
    t('builder.step4'),
    t('builder.step5'),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('builder.title')} description={t('builder.description')} />

      {/* Step indicator */}
      <nav className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((label, i) => {
          const s = (i + 1) as Step;
          return (
            <React.Fragment key={s}>
              <button
                type="button"
                onClick={() => {
                  if (s < step || canProceed((s - 1) as Step)) setStep(s);
                }}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  step === s
                    ? 'bg-primary text-white'
                    : 'bg-surface-secondary text-text-secondary hover:bg-surface'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${step === s ? 'bg-white/20' : 'bg-surface text-text-tertiary'}`}
                >
                  {s}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span className="shrink-0 text-text-tertiary">›</span>}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Wizard Panel */}
        <section className="rounded-xl border border-border bg-surface p-4 sm:p-6 space-y-6">
          {/* Step 1: Source */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-text-primary">
                {t('builder.selectSource')}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {SOURCES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSource(s.value)}
                    className={`rounded-xl border-2 p-4 text-sm font-medium transition-colors ${
                      source === s.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Dimensions */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-text-primary">
                {t('builder.selectDimensions')}
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DIMENSIONS.map((d) => (
                  <label
                    key={d.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 hover:bg-surface-secondary"
                  >
                    <Checkbox
                      checked={selectedDimensions.has(d.key)}
                      onCheckedChange={() => toggleDimension(d.key)}
                    />
                    <span className="text-sm text-text-secondary">{d.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Measures */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-text-primary">
                {t('builder.selectMeasures')}
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {MEASURES.map((m) => (
                  <label
                    key={m.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 hover:bg-surface-secondary"
                  >
                    <Checkbox
                      checked={selectedMeasures.has(m.key)}
                      onCheckedChange={() => toggleMeasure(m.key)}
                    />
                    <span className="text-sm text-text-secondary">{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Chart Type */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-text-primary">
                {t('builder.selectChart')}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {CHART_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setChartType(ct.value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-colors ${
                      chartType === ct.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
                    }`}
                  >
                    <BarChart3 className="h-6 w-6" />
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Save */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-text-primary">
                {t('builder.saveReport')}
              </h2>
              <div>
                <Label htmlFor="builder-name">{t('builder.reportName')}</Label>
                <input
                  id="builder-name"
                  type="text"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder={t('builder.reportNamePlaceholder')}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <Switch checked={isShared} onCheckedChange={setIsShared} />
                <span className="text-sm text-text-secondary">{t('builder.shareWithAdmins')}</span>
              </label>
              <Button
                onClick={() => void handleSave()}
                disabled={saving || !reportName.trim()}
                className="w-full"
              >
                {saving ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t('builder.saving')}
                  </>
                ) : (
                  <>
                    <Save className="me-2 h-4 w-4" />
                    {t('builder.save')}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => setStep((prev) => Math.max(1, prev - 1) as Step)}
              disabled={step === 1}
            >
              {t('builder.back')}
            </Button>
            {step < 5 && (
              <Button
                onClick={() => setStep((prev) => Math.min(5, prev + 1) as Step)}
                disabled={!canProceed(step)}
              >
                {t('builder.next')}
              </Button>
            )}
          </div>
        </section>

        {/* Live Preview Panel */}
        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('builder.preview')}</h3>
            {source === '' ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <BarChart3 className="h-8 w-8 text-text-tertiary" />
                <p className="text-sm text-text-tertiary">{t('builder.previewHint')}</p>
              </div>
            ) : chartType === 'table' ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="px-3 py-2 text-start font-semibold text-text-tertiary">
                        {t('builder.label')}
                      </th>
                      <th className="px-3 py-2 text-start font-semibold text-text-tertiary">
                        {t('builder.value')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_DATA.map((row) => (
                      <tr key={row.label} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2 text-text-primary">{row.label}</td>
                        <td className="px-3 py-2 text-text-secondary">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : chartType === 'bar' ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={MOCK_DATA} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : chartType === 'line' ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={MOCK_DATA} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={MOCK_DATA}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${String(name ?? '')} ${Math.round((percent ?? 0) * 100)}%`
                    }
                  >
                    {MOCK_DATA.map((_, i) => (
                      <Cell
                        key={i}
                        fill={['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][i % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Summary */}
          {source && (
            <div className="rounded-xl border border-border bg-surface p-4 space-y-2 text-xs text-text-secondary">
              <p>
                <span className="font-medium text-text-primary">{t('builder.source')}:</span>{' '}
                {source}
              </p>
              {selectedDimensions.size > 0 && (
                <p>
                  <span className="font-medium text-text-primary">{t('builder.dimensions')}:</span>{' '}
                  {Array.from(selectedDimensions).join(', ')}
                </p>
              )}
              {selectedMeasures.size > 0 && (
                <p>
                  <span className="font-medium text-text-primary">{t('builder.measures')}:</span>{' '}
                  {Array.from(selectedMeasures).join(', ')}
                </p>
              )}
              <p>
                <span className="font-medium text-text-primary">{t('builder.chart')}:</span>{' '}
                {chartType}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* My Reports */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-text-primary">{t('builder.myReports')}</h2>
        {savedReports.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t('builder.noSavedReports')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {savedReports.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
                  <FileText className="h-4 w-4 text-text-tertiary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{r.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {r.data_source} · {r.chart_type ?? 'table'}
                  </p>
                </div>
                {r.is_shared && (
                  <span className="ms-auto shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {t('builder.shared')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
