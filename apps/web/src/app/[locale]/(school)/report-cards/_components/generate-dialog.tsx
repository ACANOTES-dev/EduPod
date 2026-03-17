'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicPeriod {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
  has_period_grades: boolean;
}

interface ListResponse<T> {
  data: T[];
}

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GenerateDialog({ open, onOpenChange, onGenerated }: GenerateDialogProps) {
  const t = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [selectedPeriod, setSelectedPeriod] = React.useState('');
  const [selectAll, setSelectAll] = React.useState(true);
  const [selectedStudents, setSelectedStudents] = React.useState<Set<string>>(new Set());
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
  }, [open]);

  React.useEffect(() => {
    if (!selectedPeriod) {
      setStudents([]);
      return;
    }
    apiClient<ListResponse<Student>>(
      `/api/v1/report-cards/eligible-students?academic_period_id=${selectedPeriod}`,
    )
      .then((res) => {
        setStudents(res.data);
        setSelectedStudents(new Set(res.data.map((s) => s.id)));
      })
      .catch(() => setStudents([]));
  }, [selectedPeriod]);

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setSelectAll(false);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedStudents(new Set(students.map((s) => s.id)));
    } else {
      setSelectedStudents(new Set());
    }
  };

  const studentsWithoutGrades = students.filter(
    (s) => !s.has_period_grades && selectedStudents.has(s.id),
  );

  const selectedCount = selectAll ? students.length : selectedStudents.size;

  const handleGenerate = async () => {
    if (!selectedPeriod || selectedCount === 0) return;
    setGenerating(true);
    try {
      await apiClient('/api/v1/report-cards/generate', {
        method: 'POST',
        body: JSON.stringify({
          academic_period_id: selectedPeriod,
          student_ids: selectAll ? undefined : Array.from(selectedStudents),
        }),
      });
      onOpenChange(false);
      onGenerated();
      toast.success(`${selectedCount} report cards generated`);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('generate')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('selectPeriod')}</Label>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectPeriod')} />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPeriod && students.length > 0 && (
            <div>
              <Label>{t('selectStudents')}</Label>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={(v) => handleSelectAll(!!v)}
                  />
                  {t('allStudents')} ({students.length})
                </label>
                {!selectAll &&
                  students.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-text-primary">
                      <Checkbox
                        checked={selectedStudents.has(s.id)}
                        onCheckedChange={() => toggleStudent(s.id)}
                      />
                      {s.name}
                      {!s.has_period_grades && (
                        <AlertTriangle className="h-3.5 w-3.5 text-warning-text" />
                      )}
                    </label>
                  ))}
              </div>
            </div>
          )}

          {studentsWithoutGrades.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-warning-fill bg-warning-fill/10 p-3 text-sm text-warning-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {studentsWithoutGrades.length} student(s) do not have period grades yet.
              </span>
            </div>
          )}

          <p className="text-sm text-text-secondary">
            {selectedCount} report card(s) will be generated.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedPeriod || selectedCount === 0}
          >
            {generating ? t('generating') : t('generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
