'use client';

import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
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
} from '@school/ui';

import type { ValidationResult, ViolationDetail } from './health-score';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidateResultsProps {
  result: ValidationResult;
  onSave: () => void;
  onAcknowledgeAndSave: () => void;
  onCellClick?: (cellKey: string) => void;
  saving?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ValidateResults({
  result,
  onSave,
  onAcknowledgeAndSave,
  onCellClick,
  saving = false,
}: ValidateResultsProps) {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');
  const [ackDialogOpen, setAckDialogOpen] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);

  const hasTier1 = result.tier1_count > 0;
  const hasTier2 = result.tier2_count > 0;
  const canSave = !hasTier1;

  function handleSaveClick() {
    if (hasTier2) {
      setAckDialogOpen(true);
      setAcknowledged(false);
    } else {
      onSave();
    }
  }

  function handleAcknowledgedSave() {
    setAckDialogOpen(false);
    onAcknowledgeAndSave();
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-surface-secondary">
        <h3 className="text-sm font-semibold text-text-primary">
          {t('runs.validationResults')}
        </h3>
      </div>

      <div className="divide-y divide-border">
        {/* Tier 1 */}
        {result.tier1_violations.length > 0 && (
          <ViolationSection
            title={t('runs.tier1Blocking')}
            icon={<XCircle className="h-4 w-4 text-red-500" />}
            violations={result.tier1_violations}
            colour="red"
            onCellClick={onCellClick}
          />
        )}

        {/* Tier 2 */}
        {result.tier2_violations.length > 0 && (
          <ViolationSection
            title={t('runs.tier2Hard')}
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            violations={result.tier2_violations}
            colour="red"
            onCellClick={onCellClick}
          />
        )}

        {/* Tier 3 */}
        {result.tier3_violations.length > 0 && (
          <ViolationSection
            title={t('runs.tier3Soft')}
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            violations={result.tier3_violations}
            colour="amber"
            onCellClick={onCellClick}
          />
        )}

        {/* All clear */}
        {result.tier1_count === 0 &&
          result.tier2_count === 0 &&
          result.tier3_count === 0 && (
            <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                {t('runs.allClear')}
              </p>
            </div>
          )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
        {hasTier1 && (
          <p className="text-xs text-red-600 dark:text-red-400 me-auto">
            {t('runs.cannotSaveTier1')}
          </p>
        )}
        <Button
          onClick={handleSaveClick}
          disabled={!canSave || saving}
          variant={hasTier2 ? 'outline' : 'default'}
        >
          {hasTier2 ? t('runs.acknowledgeAndSave') : t('runs.saveSchedule')}
        </Button>
      </div>

      {/* Acknowledgement Dialog */}
      <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              {t('runs.acknowledgeTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              {t('runs.acknowledgeDescription')}
            </p>

            <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10 p-3 space-y-2 max-h-60 overflow-y-auto">
              {result.tier2_violations.map((v, i) => (
                <div key={i} className="text-xs text-red-700 dark:text-red-400">
                  <span className="font-medium">{v.code}:</span> {v.message}
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm text-text-primary">
                {t('runs.acknowledgeCheckbox')}
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAckDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleAcknowledgedSave}
              disabled={!acknowledged || saving}
              variant="destructive"
            >
              {t('runs.saveAnyway')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Violation Section ────────────────────────────────────────────────────────

function ViolationSection({
  title,
  icon,
  violations,
  colour,
  onCellClick,
}: {
  title: string;
  icon: React.ReactNode;
  violations: ViolationDetail[];
  colour: 'red' | 'amber';
  onCellClick?: (cellKey: string) => void;
}) {
  const headerBg =
    colour === 'red'
      ? 'bg-red-50 dark:bg-red-900/10'
      : 'bg-amber-50 dark:bg-amber-900/10';
  const textColour =
    colour === 'red'
      ? 'text-red-700 dark:text-red-400'
      : 'text-amber-700 dark:text-amber-400';

  return (
    <div>
      <div className={`px-4 py-2 flex items-center gap-2 ${headerBg}`}>
        {icon}
        <span className={`text-xs font-semibold uppercase tracking-wider ${textColour}`}>
          {title} ({violations.length})
        </span>
      </div>
      <div className="px-4 py-2 space-y-1.5">
        {violations.map((v, i) => (
          <div key={i} className={`text-xs ${textColour}`}>
            <span className="font-medium">{v.code}:</span> {v.message}
            {v.affected_cells?.map((cell) => (
              <button
                key={cell}
                type="button"
                onClick={() => onCellClick?.(cell)}
                className={`ms-1 underline hover:opacity-70 ${textColour}`}
              >
                [{cell}]
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
