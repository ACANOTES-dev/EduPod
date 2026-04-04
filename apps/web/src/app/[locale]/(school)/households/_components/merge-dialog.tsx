'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface Household {
  id: string;
  household_name: string;
}

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentHouseholdId: string;
  onMerged: () => void;
}

export function MergeDialog({
  open,
  onOpenChange,
  currentHouseholdId,
  onMerged,
}: MergeDialogProps) {
  const t = useTranslations('households');
  const tCommon = useTranslations('common');
  const [households, setHouseholds] = React.useState<Household[]>([]);
  const [targetId, setTargetId] = React.useState('');
  const [isMerging, setIsMerging] = React.useState(false);
  const [preview, setPreview] = React.useState<{
    students_count: number;
    parents_count: number;
    target_name: string;
  } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const fetch = async () => {
      try {
        const res = await apiClient<{ data: Household[] }>(
          '/api/v1/households?pageSize=100&status=active',
        );
        setHouseholds(res.data.filter((h) => h.id !== currentHouseholdId));
      } catch (err) {
        // ignore
        console.error('[setHouseholds]', err);
      }
    };
    void fetch();
  }, [open, currentHouseholdId]);

  React.useEffect(() => {
    if (!targetId) {
      setPreview(null);
      return;
    }
    const fetchPreview = async () => {
      try {
        const res = await apiClient<{
          data: { students_count: number; parents_count: number; target_name: string };
        }>(`/api/v1/households/${currentHouseholdId}/merge-preview?target_id=${targetId}`);
        setPreview(res.data);
      } catch (err) {
        console.error('[MergeDialog]', err);
        setPreview(null);
      }
    };
    void fetchPreview();
  }, [targetId, currentHouseholdId]);

  const handleMerge = async () => {
    if (!targetId) return;
    setIsMerging(true);
    try {
      await apiClient('/api/v1/households/merge', {
        method: 'POST',
        body: JSON.stringify({
          source_household_id: currentHouseholdId,
          target_household_id: targetId,
        }),
      });
      toast.success('Households merged successfully');
      onOpenChange(false);
      onMerged();
    } catch (err) {
      console.error('[MergeDialog]', err);
      toast.error('Failed to merge households');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('mergeHousehold')}</DialogTitle>
          <DialogDescription>{t('allStudentsParentsAndEmergency')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">{t('mergeInto')}</label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectTargetHousehold')} />
              </SelectTrigger>
              <SelectContent>
                {households.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.household_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preview && (
            <div className="rounded-xl border border-border bg-surface-secondary p-4 space-y-2">
              <p className="text-sm font-semibold text-text-primary">{t('whatWillBeMoved')}</p>
              <ul className="space-y-1 text-sm text-text-secondary">
                <li>{preview.students_count}{t('studentS')}</li>
                <li>{preview.parents_count}{t('parentS')}</li>
                <li>{t('allEmergencyContacts')}</li>
              </ul>
              <p className="text-xs text-text-tertiary">{t('destination')}<strong>{preview.target_name}</strong>
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tCommon('cancel')}</Button>
          <Button
            variant="destructive"
            disabled={!targetId || isMerging}
            onClick={() => void handleMerge()}
          >
            {isMerging ? 'Merging...' : 'Confirm Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
