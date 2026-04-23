'use client';

import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  SEN_CATEGORY_VALUES,
  SEN_SUPPORT_LEVEL_VALUES,
  type SenCategory,
  type SenSupportLevel,
} from '@school/shared/sen';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface StudentResult {
  id: string;
  full_name: string;
}

interface CreatedProfile {
  id: string;
  student_id: string;
}

interface CreateProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (profile: CreatedProfile) => void;
}

export function CreateProfileDialog({ open, onOpenChange, onCreated }: CreateProfileDialogProps) {
  const t = useTranslations('sen');
  const [saving, setSaving] = React.useState(false);

  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentResult[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentResult | null>(null);
  const [searchLoading, setSearchLoading] = React.useState(false);

  const [primaryCategory, setPrimaryCategory] = React.useState<SenCategory>('learning');
  const [supportLevel, setSupportLevel] = React.useState<SenSupportLevel>('school_support');
  const [diagnosis, setDiagnosis] = React.useState('');
  const [diagnosisDate, setDiagnosisDate] = React.useState('');
  const [diagnosisSource, setDiagnosisSource] = React.useState('');
  const [assessmentNotes, setAssessmentNotes] = React.useState('');
  const [flaggedDate, setFlaggedDate] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setStudentSearch('');
      setStudentResults([]);
      setSelectedStudent(null);
      setPrimaryCategory('learning');
      setSupportLevel('school_support');
      setDiagnosis('');
      setDiagnosisDate('');
      setDiagnosisSource('');
      setAssessmentNotes('');
      setFlaggedDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  React.useEffect(() => {
    if (!studentSearch || studentSearch.length < 2 || selectedStudent) {
      setStudentResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiClient<{ data: StudentResult[] }>(
          `/api/v1/students?search=${encodeURIComponent(studentSearch)}&pageSize=10`,
        );
        setStudentResults(res.data);
      } catch (err) {
        console.error('[CreateProfileDialog] student search', err);
        setStudentResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, selectedStudent]);

  const handleSave = React.useCallback(async () => {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        student_id: selectedStudent.id,
        sen_categories: [primaryCategory],
        primary_category: primaryCategory,
        support_level: supportLevel,
        is_active: true,
      };
      if (diagnosis.trim()) payload.diagnosis = diagnosis.trim();
      if (diagnosisDate) payload.diagnosis_date = diagnosisDate;
      if (diagnosisSource.trim()) payload.diagnosis_source = diagnosisSource.trim();
      if (assessmentNotes.trim()) payload.assessment_notes = assessmentNotes.trim();
      if (flaggedDate) payload.flagged_date = flaggedDate;

      const res = await apiClient<{ data: CreatedProfile }>('/api/v1/sen/profiles', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success(t('createProfile.success'));
      onOpenChange(false);
      onCreated(res.data);
    } catch (err) {
      console.error('[CreateProfileDialog] save', err);
      toast.error(t('createProfile.error'));
    } finally {
      setSaving(false);
    }
  }, [
    selectedStudent,
    primaryCategory,
    supportLevel,
    diagnosis,
    diagnosisDate,
    diagnosisSource,
    assessmentNotes,
    flaggedDate,
    onOpenChange,
    onCreated,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('createProfile.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Student selection */}
          <div className="space-y-2">
            <Label>{t('createProfile.student')}</Label>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  if (selectedStudent && e.target.value !== selectedStudent.full_name) {
                    setSelectedStudent(null);
                  }
                }}
                placeholder={t('createProfile.searchStudent')}
                className="ps-9"
              />
              {searchLoading && (
                <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-tertiary" />
              )}
            </div>
            {studentResults.length > 0 && !selectedStudent && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface shadow-md">
                {studentResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedStudent(s);
                      setStudentSearch(s.full_name);
                      setStudentResults([]);
                    }}
                    className="flex w-full items-center px-3 py-2 text-start text-sm text-text-primary hover:bg-surface-secondary"
                  >
                    {s.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primary category */}
          <div className="space-y-2">
            <Label>{t('createProfile.primaryCategory')}</Label>
            <Select
              value={primaryCategory}
              onValueChange={(v) => setPrimaryCategory(v as SenCategory)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEN_CATEGORY_VALUES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {t(`category.${cat}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Support level */}
          <div className="space-y-2">
            <Label>{t('createProfile.supportLevel')}</Label>
            <Select
              value={supportLevel}
              onValueChange={(v) => setSupportLevel(v as SenSupportLevel)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEN_SUPPORT_LEVEL_VALUES.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`supportLevel.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Flagged date */}
          <div className="space-y-2">
            <Label>{t('createProfile.flaggedDate')}</Label>
            <Input
              type="date"
              value={flaggedDate}
              onChange={(e) => setFlaggedDate(e.target.value)}
            />
          </div>

          {/* Diagnosis */}
          <div className="space-y-2">
            <Label>{t('createProfile.diagnosis')}</Label>
            <Input
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder={t('createProfile.diagnosisPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('createProfile.diagnosisDate')}</Label>
              <Input
                type="date"
                value={diagnosisDate}
                onChange={(e) => setDiagnosisDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('createProfile.diagnosisSource')}</Label>
              <Input
                value={diagnosisSource}
                onChange={(e) => setDiagnosisSource(e.target.value)}
                placeholder={t('createProfile.diagnosisSourcePlaceholder')}
              />
            </div>
          </div>

          {/* Assessment notes */}
          <div className="space-y-2">
            <Label>{t('createProfile.assessmentNotes')}</Label>
            <Textarea
              value={assessmentNotes}
              onChange={(e) => setAssessmentNotes(e.target.value)}
              placeholder={t('createProfile.assessmentNotesPlaceholder')}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('createProfile.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !selectedStudent}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('createProfile.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
