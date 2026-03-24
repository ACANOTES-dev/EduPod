'use client';

import { Button, Input, Label } from '@school/ui';
import { Download, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDefinition {
  id: string;
  label: string;
  category: string;
  value: string | null;
  hasGap: boolean;
}

// ─── Mock template + auto-filled data ────────────────────────────────────────

const INITIAL_FIELDS: FieldDefinition[] = [
  { id: '1', label: 'Total Active Students',           category: 'Enrolment',  value: '195',  hasGap: false },
  { id: '2', label: 'Total Teaching Staff',            category: 'Staffing',   value: '34',   hasGap: false },
  { id: '3', label: 'School-Wide Attendance Rate',     category: 'Attendance', value: '93.2%',hasGap: false },
  { id: '4', label: 'Qualified Teachers (%)',          category: 'Staffing',   value: null,   hasGap: true  },
  { id: '5', label: 'Special Education Students',      category: 'Enrolment',  value: null,   hasGap: true  },
  { id: '6', label: 'Average Class Size',              category: 'Enrolment',  value: '27',   hasGap: false },
  { id: '7', label: 'Total Annual Revenue',            category: 'Finance',    value: null,   hasGap: true  },
  { id: '8', label: 'Fee Collection Rate',             category: 'Finance',    value: '88.4%',hasGap: false },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const t = useTranslations('reports');
  const [fields, setFields] = React.useState<FieldDefinition[]>(INITIAL_FIELDS);
  const [newLabel, setNewLabel] = React.useState('');
  const [newCategory, setNewCategory] = React.useState('');

  const addField = () => {
    if (!newLabel.trim()) return;
    const field: FieldDefinition = {
      id: crypto.randomUUID(),
      label: newLabel.trim(),
      category: newCategory.trim() || 'Other',
      value: null,
      hasGap: true,
    };
    setFields((prev) => [...prev, field]);
    setNewLabel('');
    setNewCategory('');
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const gapCount = fields.filter((f) => f.hasGap).length;

  return (
    <div className="space-y-8">
      <PageHeader title={t('compliance.reportTitle')} description={t('compliance.reportDescription')} />

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {fields.filter((f) => !f.hasGap).length} {t('compliance.filled')}
        </div>
        <div className="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          {gapCount} {t('compliance.gaps')}
        </div>
      </div>

      {/* Template editor */}
      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">{t('compliance.templateTitle')}</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => alert('Export functionality — backend not yet connected')}
          >
            <Download className="me-2 h-4 w-4" />
            {t('compliance.export')}
          </Button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-secondary">
              {['category', 'dataPoint', 'value', 'status', ''].map((col, i) => (
                <th key={i} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {col ? t(`compliance.col.${col}`) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.id} className="border-b border-border last:border-b-0 hover:bg-surface-secondary">
                <td className="px-4 py-3 text-xs text-text-tertiary">{field.category}</td>
                <td className="px-4 py-3 text-sm font-medium text-text-primary">{field.label}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{field.value ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${field.hasGap ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {field.hasGap ? t('compliance.gap') : t('compliance.complete')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => removeField(field.id)}
                    className="text-text-tertiary hover:text-red-500 transition-colors"
                    aria-label={t('compliance.removeField')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Add field */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('compliance.addFieldTitle')}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <Label htmlFor="comp-label">{t('compliance.dataPointLabel')}</Label>
            <Input
              id="comp-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t('compliance.dataPointPlaceholder')}
              className="mt-1"
            />
          </div>
          <div className="w-40">
            <Label htmlFor="comp-cat">{t('compliance.categoryLabel')}</Label>
            <Input
              id="comp-cat"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder={t('compliance.categoryPlaceholder')}
              className="mt-1"
            />
          </div>
          <Button onClick={addField} disabled={!newLabel.trim()}>
            <Plus className="me-2 h-4 w-4" />
            {t('compliance.addField')}
          </Button>
        </div>
      </section>
    </div>
  );
}
