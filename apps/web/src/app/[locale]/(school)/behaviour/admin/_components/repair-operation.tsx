'use client';

import { AlertTriangle, Eye, Info, Loader2, PlayCircle, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

export interface RepairOperationDef {
  key: string;
  /** i18n key inside behaviourAdmin.operations namespace */
  i18nKey: string;
  /** Confirmation phrase the user must type */
  confirmPhrase: string;
  /** Endpoint root at /api/v1/behaviour/admin */
  endpointRoot: string;
  /** True when the backend returns a job_id and the UI should poll */
  polling?: boolean;
  /** Icon component */
  icon: React.ComponentType<{ className?: string }>;
  /** Visual accent */
  accent: 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate';
  hasPreview: boolean;
}

interface PreviewResponse {
  affected_records: number;
  affected_students: number;
  sample_records: string[];
  estimated_duration: string;
  warnings: string[];
  reversible: boolean;
  rollback_method: string | null;
}

interface ExecuteResponse {
  job_id?: string;
  status?: string;
  affected_count?: number;
}

const ACCENT_STYLES: Record<
  RepairOperationDef['accent'],
  { border: string; bg: string; icon: string }
> = {
  emerald: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    icon: 'bg-emerald-100 text-emerald-700',
  },
  indigo: {
    border: 'border-indigo-200',
    bg: 'bg-indigo-50',
    icon: 'bg-indigo-100 text-indigo-700',
  },
  amber: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    icon: 'bg-amber-100 text-amber-800',
  },
  rose: {
    border: 'border-rose-200',
    bg: 'bg-rose-50',
    icon: 'bg-rose-100 text-rose-700',
  },
  slate: {
    border: 'border-slate-200',
    bg: 'bg-slate-50',
    icon: 'bg-slate-100 text-slate-700',
  },
};

export function RepairOperationCard({ op }: { op: RepairOperationDef }) {
  const t = useTranslations(`behaviourAdmin.operations.${op.i18nKey}`);
  const tShared = useTranslations('behaviourAdmin');
  const Icon = op.icon;
  const accent = ACCENT_STYLES[op.accent];

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [executeOpen, setExecuteOpen] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const [confirmPhrase, setConfirmPhrase] = React.useState('');
  const [executing, setExecuting] = React.useState(false);
  const [executeResult, setExecuteResult] = React.useState<ExecuteResponse | null>(null);
  const [executeError, setExecuteError] = React.useState<string | null>(null);

  const loadPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    try {
      const res = await apiClient<PreviewResponse>(
        `/api/v1/behaviour/admin/${op.endpointRoot}/preview`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setPreviewData(res);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setPreviewError(ex?.error?.message ?? tShared('errors.previewFailed'));
      console.error(`[RepairOperation:${op.key}:preview]`, err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenPreview = () => {
    setPreviewOpen(true);
    if (!previewData) void loadPreview();
  };

  const handleExecute = async () => {
    if (confirmPhrase !== op.confirmPhrase) return;
    setExecuting(true);
    setExecuteError(null);
    setExecuteResult(null);
    try {
      const res = await apiClient<ExecuteResponse>(`/api/v1/behaviour/admin/${op.endpointRoot}`, {
        method: 'POST',
        body: JSON.stringify({ confirm_phrase: op.confirmPhrase }),
      });
      setExecuteResult(res);
      setConfirmPhrase('');
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setExecuteError(ex?.error?.message ?? tShared('errors.executeFailed'));
      console.error(`[RepairOperation:${op.key}:execute]`, err);
    } finally {
      setExecuting(false);
    }
  };

  const closeExecute = () => {
    setExecuteOpen(false);
    setConfirmPhrase('');
    setExecuteResult(null);
    setExecuteError(null);
  };

  return (
    <div className={`rounded-2xl border ${accent.border} ${accent.bg} p-5`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
          <p className="mt-1 text-xs text-text-secondary">{t('description')}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {op.hasPreview && (
          <Button variant="secondary" size="sm" onClick={handleOpenPreview}>
            <Eye className="me-1.5 h-3.5 w-3.5" />
            {tShared('actions.preview')}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setExecuteOpen(true)}>
          <PlayCircle className="me-1.5 h-3.5 w-3.5" />
          {tShared('actions.execute')}
        </Button>
      </div>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tShared('preview.title', { op: t('title') })}</DialogTitle>
          </DialogHeader>
          {previewLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
            </div>
          )}
          {previewError && (
            <div className="rounded-lg border border-danger-300 bg-danger-50 p-3 text-sm text-danger-800">
              {previewError}
            </div>
          )}
          {previewData && (
            <div className="space-y-2 text-sm">
              <Row
                label={tShared('preview.affectedRecords')}
                value={previewData.affected_records}
              />
              <Row
                label={tShared('preview.affectedStudents')}
                value={previewData.affected_students}
              />
              <Row
                label={tShared('preview.estimatedDuration')}
                value={previewData.estimated_duration}
              />
              <Row
                label={tShared('preview.reversible')}
                value={previewData.reversible ? tShared('preview.yes') : tShared('preview.no')}
              />
              {previewData.warnings.length > 0 && (
                <div className="rounded-lg border border-warning-300 bg-warning-50 p-3">
                  {previewData.warnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-2 text-xs text-warning-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              {tShared('actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execute dialog */}
      <Dialog open={executeOpen} onOpenChange={(o) => (o ? setExecuteOpen(true) : closeExecute())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tShared('execute.title', { op: t('title') })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
              <p className="text-xs text-rose-800">
                {tShared('execute.warning', { op: t('title') })}
              </p>
            </div>
            {executeResult ? (
              <div className="space-y-2 rounded-lg border border-success-300 bg-success-50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-success-800">
                  <ShieldCheck className="h-4 w-4" />
                  {tShared('execute.submitted')}
                </div>
                {executeResult.job_id && (
                  <p className="text-xs text-success-700">
                    {tShared('execute.jobId')} <code>{executeResult.job_id}</code>
                  </p>
                )}
                {typeof executeResult.affected_count === 'number' && (
                  <p className="text-xs text-success-700">
                    {tShared('execute.affectedCount', { count: executeResult.affected_count })}
                  </p>
                )}
              </div>
            ) : (
              <>
                <Label className="text-xs font-medium">
                  {tShared('execute.confirmLabel', { phrase: op.confirmPhrase })}
                </Label>
                <Input
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder={op.confirmPhrase}
                  autoComplete="off"
                  spellCheck={false}
                />
                {executeError && (
                  <div className="rounded-lg border border-danger-300 bg-danger-50 p-2 text-xs text-danger-800">
                    {executeError}
                  </div>
                )}
                <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-secondary p-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                  <p className="text-xs text-text-secondary">{tShared('execute.note')}</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            {executeResult ? (
              <Button onClick={closeExecute}>{tShared('actions.close')}</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={closeExecute} disabled={executing}>
                  {tShared('actions.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void handleExecute()}
                  disabled={confirmPhrase !== op.confirmPhrase || executing}
                >
                  {executing ? tShared('actions.executing') : tShared('actions.confirmExecute')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1 last:border-b-0">
      <span className="text-text-tertiary">{label}</span>
      <span className="font-semibold text-text-primary">{value}</span>
    </div>
  );
}
