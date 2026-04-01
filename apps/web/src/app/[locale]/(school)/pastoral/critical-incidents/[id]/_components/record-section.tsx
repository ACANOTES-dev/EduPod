'use client';

import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Label, Textarea } from '@school/ui';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RecordSectionProps {
  incidentId: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  error: string;
  busyAction: string | null;
  onRunAction: (key: string, action: () => Promise<void>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecordSection({
  incidentId,
  description,
  onDescriptionChange,
  error,
  busyAction,
  onRunAction,
}: RecordSectionProps) {
  const t = useTranslations('pastoral.criticalIncidentDetail');

  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('recordSection')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('recordDescription')}</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="description">{t('fields.description')}</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={7}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            disabled={busyAction === 'save-record'}
            onClick={() =>
              void onRunAction('save-record', async () => {
                const { apiClient } = await import('@/lib/api-client');
                await apiClient(`/api/v1/pastoral/critical-incidents/${incidentId}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    description: description.trim(),
                  }),
                  silent: true,
                });
              })
            }
          >
            <Save className="me-2 h-4 w-4" />
            {t('saveRecord')}
          </Button>
        </div>
      </div>
    </section>
  );
}
