'use client';

import { useTranslations } from 'next-intl';

import type { EventBudgetStatus } from '@school/shared/budgeting';
import { Button } from '@school/ui';

interface Props {
  status: EventBudgetStatus;
  householdSharePct: number;
  feeGenerationRunId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  canEdit: boolean;
  canGenerateFees: boolean;
  onSave: () => void | Promise<void>;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onComplete: () => void | Promise<void>;
  onMarkSchoolFunded: () => void | Promise<void>;
  onGenerateFees: () => void;
  onExportPdf: () => void | Promise<void>;
}

export function EventActionsFooter({
  status,
  householdSharePct,
  feeGenerationRunId,
  isDirty,
  isSaving,
  canEdit,
  canGenerateFees,
  onSave,
  onConfirm,
  onCancel,
  onComplete,
  onMarkSchoolFunded,
  onGenerateFees,
  onExportPdf,
}: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.actions');

  return (
    <footer className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === 'draft' && (
          <>
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void onSave()}
                disabled={!isDirty || isSaving}
              >
                {isSaving ? t('saving') : t('save')}
              </Button>
            )}
            {canEdit && (
              <Button type="button" onClick={() => void onConfirm()}>
                {t('confirm')}
              </Button>
            )}
            {canEdit && (
              <Button type="button" variant="outline" onClick={() => void onCancel()}>
                {t('cancelEvent')}
              </Button>
            )}
          </>
        )}

        {status === 'confirmed' && householdSharePct > 0 && (
          <>
            <Button
              type="button"
              onClick={onGenerateFees}
              disabled={!canGenerateFees}
              title={!canGenerateFees ? t('generateFeesDisabled') : undefined}
            >
              {t('generateFees')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onCancel()}
              disabled={!canEdit}
            >
              {t('cancelEvent')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onComplete()}
              disabled={!canEdit}
            >
              {t('complete')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void onExportPdf()}>
              {t('exportPdf')}
            </Button>
          </>
        )}

        {status === 'confirmed' && householdSharePct === 0 && (
          <>
            <Button
              type="button"
              onClick={() => void onMarkSchoolFunded()}
              disabled={!canGenerateFees}
            >
              {t('markSchoolFunded')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onCancel()}
              disabled={!canEdit}
            >
              {t('cancelEvent')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void onExportPdf()}>
              {t('exportPdf')}
            </Button>
          </>
        )}

        {status === 'fees_generated' && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={!feeGenerationRunId}
              asChild={Boolean(feeGenerationRunId)}
            >
              {feeGenerationRunId ? (
                <a href={`/finance/invoices?fee_generation_run_id=${feeGenerationRunId}`}>
                  {t('viewInvoices')}
                </a>
              ) : (
                <span>{t('viewInvoices')}</span>
              )}
            </Button>
            <Button type="button" variant="outline" disabled title={t('cancelBlockedByFees')}>
              {t('cancelEvent')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void onExportPdf()}>
              {t('exportPdf')}
            </Button>
          </>
        )}

        {status === 'completed' && (
          <Button type="button" variant="outline" onClick={() => void onExportPdf()}>
            {t('exportPdf')}
          </Button>
        )}

        {status === 'cancelled' && (
          <Button type="button" variant="outline" onClick={() => void onExportPdf()}>
            {t('exportPdf')}
          </Button>
        )}
      </div>
    </footer>
  );
}
