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
    staff_number: 'KLM4821-3',
    first_name: 'Fatima',
    last_name: 'Al-Hassan',
    email: 'fatima.alhassan@school.com',
    phone: '+353871234567',
    job_title: 'Mathematics Teacher',
    department: 'Academics',
    employment_status: 'active',
    employment_type: 'full_time',
    roles: ['Teacher'],
  },
  {
    staff_number: 'RVX0917-6',
    first_name: 'James',
    last_name: 'O\'Brien',
    email: 'james.obrien@school.com',
    phone: '+353879876543',
    job_title: 'School Administrator',
    department: 'Administration',
    employment_status: 'active',
    employment_type: 'full_time',
    roles: ['Admin'],
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportFormat: 'xlsx' | 'pdf';
  selectedColumns: Set<string>;
  onToggleColumn: (key: string) => void;
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
  activeColumns,
  exporting,
  onExport,
  presetName,
  onPresetNameChange,
}: ExportDialogProps) {
  const t = useTranslations('staff');

  const [presets, setPresets] = React.useState<ExportPreset[]>([]);
  React.useEffect(() => {
    if (open) setPresets(getPresets());
  }, [open]);

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const preset: ExportPreset = {
      name: presetName.trim(),
      columns: Array.from(selectedColumns),
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
          {/* Column checkboxes — Personal Information */}
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('personalFields')}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALL_EXPORT_COLUMNS.filter((c) => c.group === 'personal').map((col) => (
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

            {/* Employment Information */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('employmentFields')}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALL_EXPORT_COLUMNS.filter((c) => c.group === 'employment').map((col) => (
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
