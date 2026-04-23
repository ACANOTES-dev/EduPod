'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  SEN_PROFESSIONAL_TYPE_VALUES,
  SEN_REFERRAL_STATUS_VALUES,
  type SenProfessionalType,
  type SenReferralStatus,
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

interface AddProfessionalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  profileId: string;
}

export function AddProfessionalDialog({
  open,
  onOpenChange,
  onCreated,
  profileId,
}: AddProfessionalDialogProps) {
  const t = useTranslations('sen');
  const [saving, setSaving] = React.useState(false);

  const [professionalType, setProfessionalType] = React.useState<SenProfessionalType>(
    'educational_psychologist',
  );
  const [professionalName, setProfessionalName] = React.useState('');
  const [organisation, setOrganisation] = React.useState('');
  const [referralDate, setReferralDate] = React.useState('');
  const [assessmentDate, setAssessmentDate] = React.useState('');
  const [reportReceivedDate, setReportReceivedDate] = React.useState('');
  const [status, setStatus] = React.useState<SenReferralStatus>('pending');
  const [recommendations, setRecommendations] = React.useState('');
  const [notes, setNotes] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setProfessionalType('educational_psychologist');
      setProfessionalName('');
      setOrganisation('');
      setReferralDate(new Date().toISOString().slice(0, 10));
      setAssessmentDate('');
      setReportReceivedDate('');
      setStatus('pending');
      setRecommendations('');
      setNotes('');
    }
  }, [open]);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        sen_profile_id: profileId,
        professional_type: professionalType,
        status,
      };
      if (professionalName.trim()) payload.professional_name = professionalName.trim();
      if (organisation.trim()) payload.organisation = organisation.trim();
      if (referralDate) payload.referral_date = referralDate;
      if (assessmentDate) payload.assessment_date = assessmentDate;
      if (reportReceivedDate) payload.report_received_date = reportReceivedDate;
      if (recommendations.trim()) payload.recommendations = recommendations.trim();
      if (notes.trim()) payload.notes = notes.trim();

      await apiClient(`/api/v1/sen/profiles/${profileId}/professionals`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success(t('addProfessional.success'));
      onOpenChange(false);
      onCreated();
    } catch (err) {
      console.error('[AddProfessionalDialog] save', err);
      toast.error(t('addProfessional.error'));
    } finally {
      setSaving(false);
    }
  }, [
    profileId,
    professionalType,
    professionalName,
    organisation,
    referralDate,
    assessmentDate,
    reportReceivedDate,
    status,
    recommendations,
    notes,
    onOpenChange,
    onCreated,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('addProfessional.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('addProfessional.professionalType')}</Label>
            <Select
              value={professionalType}
              onValueChange={(v) => setProfessionalType(v as SenProfessionalType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEN_PROFESSIONAL_TYPE_VALUES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`professionalType.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('addProfessional.professionalName')}</Label>
              <Input
                value={professionalName}
                onChange={(e) => setProfessionalName(e.target.value)}
                placeholder={t('addProfessional.professionalNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('addProfessional.organisation')}</Label>
              <Input
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                placeholder={t('addProfessional.organisationPlaceholder')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{t('addProfessional.referralDate')}</Label>
              <Input
                type="date"
                value={referralDate}
                onChange={(e) => setReferralDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('addProfessional.assessmentDate')}</Label>
              <Input
                type="date"
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('addProfessional.reportReceivedDate')}</Label>
              <Input
                type="date"
                value={reportReceivedDate}
                onChange={(e) => setReportReceivedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('addProfessional.status')}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SenReferralStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEN_REFERRAL_STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`referralStatus.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('addProfessional.recommendations')}</Label>
            <Textarea
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              placeholder={t('addProfessional.recommendationsPlaceholder')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('addProfessional.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('addProfessional.notesPlaceholder')}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('addProfessional.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('addProfessional.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
