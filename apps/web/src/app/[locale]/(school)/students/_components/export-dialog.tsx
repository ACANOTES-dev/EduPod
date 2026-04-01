'use client';

import { Download, Loader2 } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@school/ui';

import {
  ALL_EXPORT_COLUMNS,
  type ExportColumn,
  type ExportPreset,
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
    status: 'active',
    entry_date: '2025-09-01',
    medical_notes: null,
    has_allergy: false,
    allergy_details: null,
    year_group: { id: '1', name: 'Year 1' },
    household: { id: '1', household_name: 'Al-Farsi Family' },
    homeroom_class: { id: '1', name: '1A' },
    student_parents: [
      {
        relationship_label: 'Father',
        parent: {
          first_name: 'Omar',
          last_name: 'Al-Farsi',
          email: 'omar@example.com',
          phone: '+971501234567',
        },
      },
      {
        relationship_label: 'Mother',
        parent: {
          first_name: 'Sara',
          last_name: 'Al-Farsi',
          email: 'sara@example.com',
          phone: '+971507654321',
        },
      },
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
    status: 'active',
    entry_date: '2025-09-01',
    medical_notes: 'Asthmatic',
    has_allergy: true,
    allergy_details: 'Peanuts',
    year_group: { id: '2', name: 'Year 2' },
    household: { id: '2', household_name: 'Murphy Family' },
    homeroom_class: { id: '2', name: '2B' },
    student_parents: [
      {
        relationship_label: 'Father',
        parent: {
          first_name: 'Sean',
          last_name: 'Murphy',
          email: 'sean@example.com',
          phone: '+353871234567',
        },
      },
    ],
  },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface StudentExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportFormat: 'xlsx' | 'pdf';
  selectedColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  activeColumns: ExportColumn[];
  exporting: boolean;
  onExport: () => void;
}

// ─── Column groups ────────────────────────────────────────────────────────────

const COLUMN_GROUPS: { key: ExportColumn['group']; label: string }[] = [
  { key: 'student', label: 'Student Details' },
  { key: 'enrolment', label: 'Enrolment' },
  { key: 'parent', label: 'Parent / Guardian' },
  { key: 'medical', label: 'Medical' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function StudentExportDialog({
  open,
  onOpenChange,
  exportFormat,
  selectedColumns,
  onToggleColumn,
  activeColumns,
  exporting,
  onExport,
}: StudentExportDialogProps) {
  const [presets, setPresets] = React.useState<ExportPreset[]>([]);
  const [presetName, setPresetName] = React.useState('');

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
    setPresetName('');
  };

  const handleDeletePreset = (name: string) => {
    deletePresetFromStorage(name);
    setPresets(getPresets());
  };

  const handleApplyPreset = (preset: ExportPreset) => {
    ALL_EXPORT_COLUMNS.forEach((col) => {
      const shouldHave = preset.columns.includes(col.key);
      const has = selectedColumns.has(col.key);
      if (shouldHave !== has) onToggleColumn(col.key);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto max-w-[calc(100vw-2rem)] min-w-[min(672px,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{exportFormat === 'xlsx' ? 'Export to Excel' : 'Export to PDF'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Column checkboxes by group */}
          {COLUMN_GROUPS.map((group) => {
            const groupCols = ALL_EXPORT_COLUMNS.filter((c) => c.group === group.key);
            if (groupCols.length === 0) return null;
            return (
              <div key={group.key}>
                <h3 className="mb-2 text-sm font-semibold text-text-primary">{group.label}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {groupCols.map((col) => (
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
            );
          })}

          {/* Preview table */}
          {activeColumns.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Preview</h3>
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
                            {col.getValue(sample as never, rowIdx)}
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
          <span className="text-xs font-medium text-text-primary">Presets:</span>
          {presets.map((p) => (
            <div key={p.name} className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleApplyPreset(p)}
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
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name..."
              className="h-7 w-32 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
            >
              Save
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={activeColumns.length === 0 || exporting} onClick={onExport}>
            {exporting ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="me-2 h-4 w-4" />
            )}
            {exporting ? 'Exporting\u2026' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
