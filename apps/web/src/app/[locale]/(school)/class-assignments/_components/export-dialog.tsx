'use client';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@school/ui';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  ALL_EXPORT_COLUMNS,
  ExportColumn,
  ExportPreset,
  deletePresetFromStorage,
  getPresets,
  savePresetToStorage,
} from './export-utils';

// ─── Sample preview data ──────────────────────────────────────────────────────

const PREVIEW_ROWS = [
  {
    student_number: 'STU-202603-001',
    first_name: 'Aisha',
    middle_name: 'May',
    last_name: 'Al-Farsi',
    national_id: '7841234',
    nationality: 'Emirati',
    city_of_birth: 'Dubai',
    gender: 'female',
    date_of_birth: '2018-03-15',
    medical_notes: null,
    has_allergy: false,
    allergy_details: null,
    parents: [
      { first_name: 'Omar', last_name: 'Al-Farsi', email: 'omar@example.com', phone: '+971501234567' },
      { first_name: 'Sara', last_name: 'Al-Farsi', email: 'sara@example.com', phone: '+971507654321' },
    ],
  },
  {
    student_number: 'STU-202603-002',
    first_name: 'Liam',
    middle_name: null,
    last_name: 'Murphy',
    national_id: '9087654',
    nationality: 'Irish',
    city_of_birth: 'Cork',
    gender: 'male',
    date_of_birth: '2017-09-22',
    medical_notes: 'Asthmatic',
    has_allergy: true,
    allergy_details: 'Peanuts',
    parents: [
      { first_name: 'Sean', last_name: 'Murphy', email: 'sean@example.com', phone: '+353871234567' },
    ],
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportFormat: 'xlsx' | 'pdf';
  selectedColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  exportGrouping: 'subclass' | 'year_level';
  onGroupingChange: (g: 'subclass' | 'year_level') => void;
  activeColumns: ExportColumn[];
  exporting: boolean;
  onExport: () => void;
  presetName: string;
  onPresetNameChange: (name: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportDialog({
  open,
  onOpenChange,
  exportFormat,
  selectedColumns,
  onToggleColumn,
  exportGrouping,
  onGroupingChange,
  activeColumns,
  exporting,
  onExport,
  presetName,
  onPresetNameChange,
}: ExportDialogProps) {
  const t = useTranslations('classAssignments');

  // Re-render presets on open so they're fresh from localStorage
  const [presets, setPresets] = React.useState<ExportPreset[]>([]);
  React.useEffect(() => {
    if (open) setPresets(getPresets());
  }, [open]);

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const preset: ExportPreset = {
      name: presetName.trim(),
      columns: Array.from(selectedColumns),
      grouping: exportGrouping,
    };
    savePresetToStorage(preset);
    setPresets(getPresets());
    onPresetNameChange('');
  };

  const handleDeletePreset = (name: string) => {
    deletePresetFromStorage(name);
    setPresets(getPresets());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto max-w-[calc(100vw-2rem)] min-w-[min(672px,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {exportFormat === 'xlsx' ? t('exportExcel') : t('exportPdf')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Grouping toggle */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-secondary p-3">
            <span className="text-sm font-medium text-text-primary">{t('groupBy')}</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => onGroupingChange('subclass')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  exportGrouping === 'subclass'
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface text-text-secondary hover:bg-surface-secondary'
                }`}
              >
                {t('groupBySubclass')}
              </button>
              <button
                type="button"
                onClick={() => onGroupingChange('year_level')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  exportGrouping === 'year_level'
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface text-text-secondary hover:bg-surface-secondary'
                }`}
              >
                {t('groupByYearLevel')}
              </button>
            </div>
          </div>

          {/* Column checkboxes */}
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('studentFields')}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALL_EXPORT_COLUMNS.filter((c) => c.group === 'student').map((col) => (
                  <label
                    key={col.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-surface-secondary"
                  >
                    <Checkbox
                      checked={selectedColumns.has(col.key)}
                      onCheckedChange={() => onToggleColumn(col.key)}
                    />
                    <span className="text-sm text-text-primary">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('parentFields')}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALL_EXPORT_COLUMNS.filter((c) => c.group === 'parent').map((col) => (
                  <label
                    key={col.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-surface-secondary"
                  >
                    <Checkbox
                      checked={selectedColumns.has(col.key)}
                      onCheckedChange={() => onToggleColumn(col.key)}
                    />
                    <span className="text-sm text-text-primary">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Preview table */}
          {activeColumns.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('preview')}</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-secondary">
                      {activeColumns.map((col) => (
                        <th
                          key={col.key}
                          className="whitespace-nowrap px-3 py-2 text-start font-semibold text-text-primary"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {PREVIEW_ROWS.map((sample, rowIdx) => (
                      <tr key={rowIdx}>
                        {activeColumns.map((col) => (
                          <td
                            key={col.key}
                            className="whitespace-nowrap px-3 py-2 text-text-secondary"
                          >
                            {col.getValue(sample, rowIdx)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-secondary p-3">
          <span className="text-xs font-medium text-text-primary">{t('presets')}:</span>
          {presets.map((p) => (
            <div key={p.name} className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  onGroupingChange(p.grouping);
                  // Caller's selectedColumns will be updated via onToggleColumn —
                  // but we need to set the whole set. Signal via a special reset approach:
                  // We close and reopen is not ideal. Instead pass a callback.
                  ALL_EXPORT_COLUMNS.forEach((col) => {
                    const shouldHave = p.columns.includes(col.key);
                    const has = selectedColumns.has(col.key);
                    if (shouldHave !== has) onToggleColumn(col.key);
                  });
                }}
              >
                {p.name}
              </Button>
              <button
                type="button"
                onClick={() => handleDeletePreset(p.name)}
                className="px-1 text-xs text-text-tertiary hover:text-danger-text"
              >
                x
              </button>
            </div>
          ))}
          <div className="ms-auto flex items-center gap-1">
            <input
              type="text"
              value={presetName}
              onChange={(e) => onPresetNameChange(e.target.value)}
              placeholder={t('presetNamePlaceholder')}
              className="h-7 w-32 rounded-md border border-border bg-surface px-2 text-xs text-text-primary placeholder:text-text-tertiary"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
            >
              {t('savePreset')}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            disabled={activeColumns.length === 0 || exporting}
            onClick={onExport}
          >
            <Download className="me-2 h-4 w-4" />
            {exporting ? t('exporting') : t('exportNow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
