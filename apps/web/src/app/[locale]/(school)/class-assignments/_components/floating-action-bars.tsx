'use client';

import { Save, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { HomeroomClass } from './export-utils';

// ─── Bulk Assign Bar ──────────────────────────────────────────────────────────

interface BulkAssignBarProps {
  selectedCount: number;
  bulkAssignClassId: string;
  bulkAssignClasses: HomeroomClass[];
  onClassChange: (classId: string) => void;
  onAssign: () => void;
  onClear: () => void;
}

export function BulkAssignBar({
  selectedCount,
  bulkAssignClassId,
  bulkAssignClasses,
  onClassChange,
  onAssign,
  onClear,
}: BulkAssignBarProps) {
  const t = useTranslations('classAssignments');

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
      <div className="mx-auto flex max-w-screen-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary-500" />
          <p className="text-sm font-medium text-text-secondary">
            {t('selectedStudents', { count: selectedCount })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={bulkAssignClassId} onValueChange={onClassChange}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-48">
              <SelectValue placeholder={t('assignToClass')} />
            </SelectTrigger>
            <SelectContent>
              {bulkAssignClasses.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!bulkAssignClassId} onClick={onAssign}>
            {t('assignSelected')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            {t('clearSelection')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Save Bar ─────────────────────────────────────────────────────────────────

interface SaveBarProps {
  pendingCount: number;
  saving: boolean;
  onSave: () => void;
}

export function SaveBar({ pendingCount, saving, onSave }: SaveBarProps) {
  const t = useTranslations('classAssignments');

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between">
        <p className="text-sm font-medium text-text-secondary">
          {t('pendingChanges', { count: pendingCount })}
        </p>
        <Button onClick={onSave} disabled={saving}>
          <Save className="me-2 h-4 w-4" />
          {saving ? t('saving') : t('saveAssignments')}
        </Button>
      </div>
    </div>
  );
}
