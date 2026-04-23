'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { ACCOMMODATION_TYPE_VALUES, type AccommodationType } from '@school/shared/sen';
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

interface AddAccommodationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  profileId: string;
}

export function AddAccommodationDialog({
  open,
  onOpenChange,
  onCreated,
  profileId,
}: AddAccommodationDialogProps) {
  const t = useTranslations('sen');
  const [saving, setSaving] = React.useState(false);

  const [accommodationType, setAccommodationType] = React.useState<AccommodationType>('classroom');
  const [description, setDescription] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      setAccommodationType('classroom');
      setDescription('');
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate('');
      setIsActive(true);
    }
  }, [open]);

  const handleSave = React.useCallback(async () => {
    if (!description.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        sen_profile_id: profileId,
        accommodation_type: accommodationType,
        description: description.trim(),
        details: {},
        is_active: isActive,
      };
      if (startDate) payload.start_date = startDate;
      if (endDate) payload.end_date = endDate;

      await apiClient(`/api/v1/sen/profiles/${profileId}/accommodations`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success(t('addAccommodation.success'));
      onOpenChange(false);
      onCreated();
    } catch (err) {
      console.error('[AddAccommodationDialog] save', err);
      toast.error(t('addAccommodation.error'));
    } finally {
      setSaving(false);
    }
  }, [
    profileId,
    accommodationType,
    description,
    startDate,
    endDate,
    isActive,
    onOpenChange,
    onCreated,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addAccommodation.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('addAccommodation.type')}</Label>
            <Select
              value={accommodationType}
              onValueChange={(v) => setAccommodationType(v as AccommodationType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOMMODATION_TYPE_VALUES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {t(`accommodationType.${a}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('addAccommodation.description')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('addAccommodation.descriptionPlaceholder')}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('addAccommodation.startDate')}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('addAccommodation.endDate')}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
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
            {t('addAccommodation.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !description.trim()}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('addAccommodation.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
