'use client';

import { AlertTriangle, Check, KeyRound, Shield, User } from 'lucide-react';
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
  Textarea,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface StaffOption {
  id: string;
  user: { id: string; first_name: string; last_name: string; email: string };
  job_title: string | null;
}

interface ConcernOption {
  id: string;
  summary?: string;
  category: string | null;
  student_name?: string | null;
}

interface RequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGranted: (grantId: string) => void;
}

type Step = 1 | 2 | 3 | 4;

export function BreakGlassRequestDialog({ open, onOpenChange, onGranted }: RequestDialogProps) {
  const t = useTranslations('safeguardingBreakGlass.request');
  const [step, setStep] = React.useState<Step>(1);

  // Step 1 — justification + staff
  const [reason, setReason] = React.useState('');
  const [staffQuery, setStaffQuery] = React.useState('');
  const [staffResults, setStaffResults] = React.useState<StaffOption[]>([]);
  const [selectedStaff, setSelectedStaff] = React.useState<StaffOption | null>(null);
  const [loadingStaff, setLoadingStaff] = React.useState(false);

  // Step 2 — scope
  const [scope, setScope] = React.useState<'all_concerns' | 'specific_concerns'>('all_concerns');
  const [concerns, setConcerns] = React.useState<ConcernOption[]>([]);
  const [selectedConcernIds, setSelectedConcernIds] = React.useState<Set<string>>(new Set());

  // Step 3 — duration
  const [durationHours, setDurationHours] = React.useState(4);

  // Step 4 — confirm
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setReason('');
      setStaffQuery('');
      setStaffResults([]);
      setSelectedStaff(null);
      setScope('all_concerns');
      setSelectedConcernIds(new Set());
      setDurationHours(4);
      setAcknowledged(false);
      setSubmitError(null);
    }
  }, [open]);

  // Staff search (debounced)
  React.useEffect(() => {
    if (!staffQuery.trim() || staffQuery.trim().length < 2) {
      setStaffResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoadingStaff(true);
      void apiClient<{ data: StaffOption[] }>(
        `/api/v1/staff-profiles?search=${encodeURIComponent(staffQuery)}&pageSize=8`,
      )
        .then((res) => setStaffResults(res.data ?? []))
        .catch((err) => {
          console.error('[BreakGlassRequestDialog:staff]', err);
          setStaffResults([]);
        })
        .finally(() => setLoadingStaff(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [staffQuery]);

  // Concern list (only when scope = specific)
  React.useEffect(() => {
    if (scope !== 'specific_concerns' || concerns.length > 0) return;
    void apiClient<{ data: ConcernOption[] }>('/api/v1/safeguarding/concerns?pageSize=50')
      .then((res) => setConcerns(res.data ?? []))
      .catch((err) => {
        console.error('[BreakGlassRequestDialog:concerns]', err);
        setConcerns([]);
      });
  }, [scope, concerns.length]);

  const toggleConcern = (id: string) => {
    setSelectedConcernIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canAdvance = () => {
    if (step === 1) return reason.trim().length >= 100 && selectedStaff !== null;
    if (step === 2)
      return (
        scope === 'all_concerns' || (scope === 'specific_concerns' && selectedConcernIds.size > 0)
      );
    if (step === 3) return durationHours >= 1 && durationHours <= 72;
    if (step === 4) return acknowledged;
    return false;
  };

  const handleNext = () => {
    if (!canAdvance()) return;
    if (step < 4) setStep((step + 1) as Step);
    else void handleSubmit();
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleSubmit = async () => {
    if (!selectedStaff) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        granted_to_id: selectedStaff.user.id,
        reason: reason.trim(),
        duration_hours: durationHours,
        scope,
        ...(scope === 'specific_concerns'
          ? { scoped_concern_ids: Array.from(selectedConcernIds) }
          : {}),
      };
      const res = await apiClient<{ data: { id: string; expires_at: string } }>(
        '/api/v1/safeguarding/break-glass',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      onGranted(res.data.id);
      onOpenChange(false);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setSubmitError(ex?.error?.message ?? t('errors.generic'));
      console.error('[BreakGlassRequestDialog:submit]', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-rose-600" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper pips */}
        <div className="flex items-center gap-2 pb-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={`h-1.5 flex-1 rounded-full ${step >= n ? 'bg-rose-500' : 'bg-border'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">{t('step1.staff')}</Label>
              <p className="mb-2 text-xs text-text-tertiary">{t('step1.staffHint')}</p>
              {selectedStaff ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-3 py-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-text-tertiary" />
                    <div>
                      <p className="text-sm font-medium">
                        {selectedStaff.user.first_name} {selectedStaff.user.last_name}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {selectedStaff.job_title ?? selectedStaff.user.email}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStaff(null);
                      setStaffQuery('');
                    }}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    {t('step1.clear')}
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    type="search"
                    placeholder={t('step1.searchPlaceholder')}
                    value={staffQuery}
                    onChange={(e) => setStaffQuery(e.target.value)}
                  />
                  {loadingStaff && (
                    <p className="mt-2 text-xs text-text-tertiary">{t('step1.searching')}</p>
                  )}
                  {staffResults.length > 0 && (
                    <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface">
                      {staffResults.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStaff(s);
                              setStaffResults([]);
                              setStaffQuery('');
                            }}
                            className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-start text-sm last:border-b-0 hover:bg-surface-secondary"
                          >
                            <span>
                              <span className="font-medium">
                                {s.user.first_name} {s.user.last_name}
                              </span>{' '}
                              <span className="text-xs text-text-tertiary">
                                · {s.job_title ?? s.user.email}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">{t('step1.reason')}</Label>
              <p className="mb-2 text-xs text-text-tertiary">{t('step1.reasonHint')}</p>
              <Textarea
                rows={5}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('step1.reasonPlaceholder')}
              />
              <p
                className={`mt-1 text-xs ${
                  reason.trim().length >= 100 ? 'text-success-600' : 'text-text-tertiary'
                }`}
              >
                {t('step1.reasonCount', {
                  count: reason.trim().length,
                  required: 100,
                })}
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">{t('step2.intro')}</p>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-surface-secondary">
              <input
                type="radio"
                name="scope"
                checked={scope === 'all_concerns'}
                onChange={() => setScope('all_concerns')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium">{t('step2.all.title')}</p>
                <p className="text-xs text-text-tertiary">{t('step2.all.desc')}</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-surface-secondary">
              <input
                type="radio"
                name="scope"
                checked={scope === 'specific_concerns'}
                onChange={() => setScope('specific_concerns')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium">{t('step2.specific.title')}</p>
                <p className="text-xs text-text-tertiary">{t('step2.specific.desc')}</p>
              </div>
            </label>

            {scope === 'specific_concerns' && (
              <div className="rounded-lg border border-border bg-surface-secondary p-3">
                {concerns.length === 0 ? (
                  <p className="text-sm text-text-tertiary">{t('step2.noConcerns')}</p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {concerns.map((c) => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-surface">
                          <input
                            type="checkbox"
                            checked={selectedConcernIds.has(c.id)}
                            onChange={() => toggleConcern(c.id)}
                          />
                          <span className="flex-1 text-sm">
                            <span className="font-medium">
                              {c.student_name ?? t('step2.unknownStudent')}
                            </span>{' '}
                            <span className="text-xs text-text-tertiary">
                              · {c.category ?? '—'}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-text-tertiary">
                  {t('step2.selectedCount', { count: selectedConcernIds.size })}
                </p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{t('step3.intro')}</p>
            <div>
              <Label className="text-sm font-medium">
                {t('step3.duration', { hours: durationHours })}
              </Label>
              <input
                type="range"
                min={1}
                max={72}
                step={1}
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-text-tertiary">
                <span>1h</span>
                <span>24h</span>
                <span>72h</span>
              </div>
            </div>
            {durationHours > 24 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning-300 bg-warning-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" />
                <p className="text-xs text-warning-800">{t('step3.longDurationWarning')}</p>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-secondary p-4 text-sm">
              <div className="flex items-center justify-between py-1">
                <span className="text-text-tertiary">{t('step4.labels.staff')}</span>
                <span className="font-medium">
                  {selectedStaff?.user.first_name} {selectedStaff?.user.last_name}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-text-tertiary">{t('step4.labels.scope')}</span>
                <span className="font-medium">
                  {scope === 'all_concerns'
                    ? t('step2.all.title')
                    : t('step4.labels.specificCount', { count: selectedConcernIds.size })}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-text-tertiary">{t('step4.labels.duration')}</span>
                <span className="font-medium">{t('step3.duration', { hours: durationHours })}</span>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              <div className="text-sm text-rose-900">
                <p className="font-medium">{t('step4.acknowledge.title')}</p>
                <p className="mt-1 text-xs">{t('step4.acknowledge.body')}</p>
              </div>
            </label>

            {submitError && (
              <div className="flex items-start gap-2 rounded-lg border border-danger-300 bg-danger-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" />
                <p className="text-xs text-danger-800">{submitError}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-4 flex items-center justify-between gap-2">
          {step > 1 ? (
            <Button variant="secondary" onClick={handleBack} disabled={submitting}>
              {t('back')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t('cancel')}
            </Button>
          )}
          <Button onClick={handleNext} disabled={!canAdvance() || submitting}>
            {step < 4 ? (
              t('next')
            ) : submitting ? (
              t('submitting')
            ) : (
              <>
                <Shield className="me-1.5 h-4 w-4" />
                {t('grant')}
              </>
            )}
            {step < 4 && <Check className="ms-1.5 h-4 w-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
