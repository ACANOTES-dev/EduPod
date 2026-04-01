'use client';

import { Download, Mail, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface TemplateColumn {
  field: string;
  header: string;
  enabled: boolean;
}

interface ExportTemplate {
  id: string;
  name: string;
  columns_json: TemplateColumn[];
  file_format: 'csv' | 'xlsx';
  created_at: string;
}

interface ExportLogEntry {
  id: string;
  exported_at: string;
  template_name: string;
  period_label: string;
  exported_by_name: string;
  row_count: number;
  file_name: string;
}

const AVAILABLE_FIELDS: { field: string; labelKey: string }[] = [
  { field: 'staff_name', labelKey: 'fieldStaffName' },
  { field: 'staff_number', labelKey: 'fieldStaffNumber' },
  { field: 'department', labelKey: 'fieldDepartment' },
  { field: 'compensation_type', labelKey: 'fieldCompensationType' },
  { field: 'days_worked', labelKey: 'fieldDaysWorked' },
  { field: 'classes_taught', labelKey: 'fieldClassesTaught' },
  { field: 'gross_basic', labelKey: 'fieldGrossBasic' },
  { field: 'gross_bonus', labelKey: 'fieldGrossBonus' },
  { field: 'allowances_total', labelKey: 'fieldAllowancesTotal' },
  { field: 'adjustments_total', labelKey: 'fieldAdjustmentsTotal' },
  { field: 'gross_total', labelKey: 'fieldGrossTotal' },
  { field: 'period', labelKey: 'fieldPeriod' },
  { field: 'notes', labelKey: 'fieldNotes' },
];

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ExportTemplate;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('payroll');
  const [name, setName] = React.useState(initial?.name ?? '');
  const [format, setFormat] = React.useState<'csv' | 'xlsx'>(initial?.file_format ?? 'csv');
  const [columns, setColumns] = React.useState<TemplateColumn[]>(
    initial?.columns_json ??
      AVAILABLE_FIELDS.map((f) => ({
        field: f.field,
        header: f.field.replace(/_/g, ' '),
        enabled: true,
      })),
  );
  const [isSaving, setIsSaving] = React.useState(false);

  const toggleColumn = (field: string) => {
    setColumns((prev) => prev.map((c) => (c.field === field ? { ...c, enabled: !c.enabled } : c)));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const payload = { name, file_format: format, columns_json: columns.filter((c) => c.enabled) };
      if (initial) {
        await apiClient(`/api/v1/payroll/export-templates/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient('/api/v1/payroll/export-templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSave();
    } catch (err) {
      // silent
      console.error('[onSave]', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">
        {initial ? t('editTemplate') : t('newTemplate')}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm">{t('templateName')}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('templateNamePlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">{t('fileFormat')}</Label>
          <div className="flex gap-2">
            {(['csv', 'xlsx'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
                  format === f
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface-secondary text-text-secondary hover:text-text-primary'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text-primary">{t('selectColumns')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AVAILABLE_FIELDS.map((f) => {
            const col = columns.find((c) => c.field === f.field);
            const enabled = col?.enabled ?? false;
            return (
              <label
                key={f.field}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                  enabled
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-text-secondary hover:bg-surface-secondary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleColumn(f.field)}
                  className="h-3 w-3 accent-primary"
                />
                {t(f.labelKey as Parameters<typeof t>[0])}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
          {isSaving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}

export default function ExportsPage() {
  const t = useTranslations('payroll');

  const [activeTab, setActiveTab] = React.useState<'templates' | 'history'>('templates');
  const [templates, setTemplates] = React.useState<ExportTemplate[]>([]);
  const [history, setHistory] = React.useState<ExportLogEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editTemplate, setEditTemplate] = React.useState<ExportTemplate | null>(null);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [tmplRes, histRes] = await Promise.all([
        apiClient<{ data: ExportTemplate[] }>('/api/v1/payroll/export-templates'),
        apiClient<{ data: ExportLogEntry[] }>('/api/v1/payroll/export-logs'),
      ]);
      setTemplates(tmplRes.data);
      setHistory(histRes.data);
    } catch (err) {
      // silent
      console.error('[setHistory]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('deleteTemplateConfirm'))) return;
    try {
      await apiClient(`/api/v1/payroll/export-templates/${id}`, { method: 'DELETE' });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      // silent
      console.error('[setTemplates]', err);
    }
  };

  const handleSendToAccountant = async (logId: string) => {
    try {
      await apiClient(`/api/v1/payroll/export-logs/${logId}/send`, { method: 'POST' });
    } catch (err) {
      // silent
      console.error('[apiClient]', err);
    }
  };

  const tabs = [
    { key: 'templates' as const, label: t('templates') },
    { key: 'history' as const, label: t('exportHistory') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('exports')}
        actions={
          activeTab === 'templates' && (
            <Button
              onClick={() => {
                setEditTemplate(null);
                setShowForm(true);
              }}
            >
              <Plus className="me-1.5 h-4 w-4" />
              {t('newTemplate')}
            </Button>
          )
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface-secondary p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* New/Edit form */}
      {showForm && (
        <TemplateForm
          initial={editTemplate ?? undefined}
          onSave={() => {
            setShowForm(false);
            setEditTemplate(null);
            void fetchData();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditTemplate(null);
          }}
        />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : activeTab === 'templates' ? (
        /* Templates list */
        <div className="space-y-3">
          {templates.length === 0 && !showForm ? (
            <div className="rounded-2xl border border-border bg-surface py-12 text-center text-sm text-text-tertiary">
              {t('noTemplates')}
            </div>
          ) : (
            templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-text-primary">{tmpl.name}</p>
                  <p className="text-xs text-text-secondary">
                    {tmpl.file_format.toUpperCase()} &middot; {tmpl.columns_json.length}{' '}
                    {t('columns')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditTemplate(tmpl);
                      setShowForm(true);
                    }}
                  >
                    {t('edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(tmpl.id)}
                    className="text-danger-600 hover:text-danger-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* History table */
        <div className="rounded-2xl border border-border bg-surface">
          <div className="overflow-x-auto">
            {history.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-tertiary">{t('noData')}</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('exportedAt')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('templateName')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('period')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('exportedBy')}
                    </th>
                    <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                      {t('rows')}
                    </th>
                    <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                      {t('actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((entry) => (
                    <tr key={entry.id} className="hover:bg-surface-secondary">
                      <td className="px-4 py-3 text-text-primary">
                        {new Date(entry.exported_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{entry.template_name}</td>
                      <td className="px-4 py-3 text-text-secondary">{entry.period_label}</td>
                      <td className="px-4 py-3 text-text-secondary">{entry.exported_by_name}</td>
                      <td className="px-4 py-3 text-end text-text-secondary">{entry.row_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" title={t('download')}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSendToAccountant(entry.id)}
                            title={t('sendToAccountant')}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
