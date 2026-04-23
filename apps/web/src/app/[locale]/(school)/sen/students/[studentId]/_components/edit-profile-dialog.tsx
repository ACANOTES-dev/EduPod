'use client';

import { Loader2 } from 'lucide-react';
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

export interface EditProfileInitial {
  id: string;
  primary_category: string;
  support_level: string;
  sen_categories: string[];
  diagnosis: string | null;
  diagnosis_date: string | null;
  diagnosis_source: string | null;
  assessment_notes: string | null;
  is_active: boolean;
}

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  initial: EditProfileInitial;
}

export function EditProfileDialog({
  open,
  onOpenChange,
  onSaved,
  initial,
}: EditProfileDialogProps) {
  const t = useTranslations('sen');
  const [saving, setSaving] = React.useState(false);

  const [primaryCategory, setPrimaryCategory] = React.useState<SenCategory>(
    initial.primary_category as SenCategory,
  );
  const [supportLevel, setSupportLevel] = React.useState<SenSupportLevel>(
    initial.support_level as SenSupportLevel,
  );
  const [diagnosis, setDiagnosis] = React.useState(initial.diagnosis ?? '');
  const [diagnosisDate, setDiagnosisDate] = React.useState(initial.diagnosis_date ?? '');
  const [diagnosisSource, setDiagnosisSource] = React.useState(initial.diagnosis_source ?? '');
  const [assessmentNotes, setAssessmentNotes] = React.useState(initial.assessment_notes ?? '');
  const [isActive, setIsActive] = React.useState(initial.is_active);

  React.useEffect(() => {
    if (open) {
      setPrimaryCategory(initial.primary_category as SenCategory);
      setSupportLevel(initial.support_level as SenSupportLevel);
      setDiagnosis(initial.diagnosis ?? '');
      setDiagnosisDate(initial.diagnosis_date ?? '');
      setDiagnosisSource(initial.diagnosis_source ?? '');
      setAssessmentNotes(initial.assessment_notes ?? '');
      setIsActive(initial.is_active);
    }
  }, [open, initial]);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        primary_category: primaryCategory,
        sen_categories: Array.from(new Set([...initial.sen_categories, primaryCategory])),
        support_level: supportLevel,
        diagnosis: diagnosis.trim() || null,
        diagnosis_date: diagnosisDate || null,
        diagnosis_source: diagnosisSource.trim() || null,
        assessment_notes: assessmentNotes.trim() || null,
        is_active: isActive,
      };

      await apiClient(`/api/v1/sen/profiles/${initial.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success(t('editProfile.success'));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error('[EditProfileDialog] save', err);
      toast.error(t('editProfile.error'));
    } finally {
      setSaving(false);
    }
  }, [
    initial,
    primaryCategory,
    supportLevel,
    diagnosis,
    diagnosisDate,
    diagnosisSource,
    assessmentNotes,
    isActive,
    onOpenChange,
    onSaved,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('editProfile.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="space-y-2">
            <Label>{t('createProfile.assessmentNotes')}</Label>
            <Textarea
              value={assessmentNotes}
              onChange={(e) => setAssessmentNotes(e.target.value)}
              placeholder={t('createProfile.assessmentNotesPlaceholder')}
              rows={3}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span>{t('addAccommodation.isActive')}</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('editProfile.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('editProfile.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
