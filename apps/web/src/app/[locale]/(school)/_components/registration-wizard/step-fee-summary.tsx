'use client';

import { Loader2, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { FeePreviewResult, RegistrationResult, WizardAction, WizardState } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface StepFeeSummaryProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StepFeeSummary({ state, dispatch }: StepFeeSummaryProps) {
  const t = useTranslations('registration');

  const [selectedDiscountId, setSelectedDiscountId] = React.useState('');
  const [adjLabel, setAdjLabel] = React.useState('');
  const [adjAmount, setAdjAmount] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Fetch fee preview on mount
  React.useEffect(() => {
    if (state.feePreview) return; // already loaded
    const fetchFees = async () => {
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        const res = await apiClient<{ data: FeePreviewResult }>(
          '/api/v1/registration/family/preview-fees',
          {
            method: 'POST',
            silent: true,
            body: JSON.stringify({
              students: state.students.map((s) => ({ year_group_id: s.year_group_id })),
            }),
          },
        );
        dispatch({ type: 'SET_FEE_PREVIEW', preview: res.data });
      } catch (err) {
        console.error('[StepFeeSummary.fetchFees]', err);
        dispatch({ type: 'SET_ERROR', error: 'Failed to load fee preview' });
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    };
    void fetchFees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived calculations ────────────────────────────────────────────────

  const visibleStudentFees = React.useMemo(() => {
    if (!state.feePreview) return [];
    return state.feePreview.students.map((sp) => ({
      ...sp,
      fees: sp.fees.filter((f) => !state.removedFees.includes(f.fee_structure_id)),
    }));
  }, [state.feePreview, state.removedFees]);

  const feesTotal = React.useMemo(() => {
    return visibleStudentFees.reduce(
      (sum, sp) => sum + sp.fees.reduce((feeSum, f) => feeSum + f.annual_amount, 0),
      0,
    );
  }, [visibleStudentFees]);

  const discountsTotal = React.useMemo(() => {
    if (!state.feePreview) return 0;
    return state.appliedDiscounts.reduce((sum, d) => {
      const disc = state.feePreview?.available_discounts.find(
        (ad) => ad.discount_id === d.discount_id,
      );
      if (!disc) return sum;
      if (disc.discount_type === 'fixed') return sum + disc.value;
      // percent — apply to fee total
      return sum + (feesTotal * disc.value) / 100;
    }, 0);
  }, [state.appliedDiscounts, state.feePreview, feesTotal]);

  const adjTotal = React.useMemo(() => {
    return state.adhocAdjustments.reduce((sum, a) => sum + a.amount, 0);
  }, [state.adhocAdjustments]);

  const grandTotal = Math.max(0, feesTotal - discountsTotal - adjTotal);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleApplyDiscount = React.useCallback(() => {
    if (!selectedDiscountId) return;
    dispatch({ type: 'ADD_DISCOUNT', discount_id: selectedDiscountId, fee_assignment_index: 0 });
    setSelectedDiscountId('');
  }, [selectedDiscountId, dispatch]);

  const handleAddAdjustment = React.useCallback(() => {
    const label = adjLabel.trim();
    const amount = parseFloat(adjAmount);
    if (!label || isNaN(amount) || amount <= 0) return;
    dispatch({ type: 'ADD_ADHOC_ADJUSTMENT', label, amount });
    setAdjLabel('');
    setAdjAmount('');
  }, [adjLabel, adjAmount, dispatch]);

  const handleConfirmRegister = React.useCallback(async () => {
    if (!state.feePreview) return;

    setIsSubmitting(true);
    dispatch({ type: 'SET_LOADING', loading: true });

    try {
      const feeAssignments: { student_index: number; fee_structure_id: string }[] = [];
      for (const studentPreview of state.feePreview.students) {
        for (const fee of studentPreview.fees) {
          if (!state.removedFees.includes(fee.fee_structure_id)) {
            feeAssignments.push({
              student_index: studentPreview.student_index,
              fee_structure_id: fee.fee_structure_id,
            });
          }
        }
      }

      const cleanParent = (p: typeof state.primaryParent) => ({
        ...p,
        email: p.email || undefined,
      });

      const dto = {
        primary_parent: cleanParent(state.primaryParent),
        secondary_parent:
          state.showSecondaryParent && state.secondaryParent
            ? cleanParent(state.secondaryParent)
            : undefined,
        household: state.household,
        emergency_contacts: state.emergencyContacts,
        students: state.students.map((s) => ({
          first_name: s.first_name,
          middle_name: s.middle_name || undefined,
          last_name: s.last_name,
          date_of_birth: s.date_of_birth,
          gender: s.gender,
          year_group_id: s.year_group_id,
          national_id: s.national_id,
        })),
        fee_assignments: feeAssignments,
        applied_discounts: state.appliedDiscounts,
        adhoc_adjustments: state.adhocAdjustments,
        consents: state.consents,
      };

      const res = await apiClient<{ data: RegistrationResult }>('/api/v1/registration/family', {
        method: 'POST',
        silent: true,
        body: JSON.stringify(dto),
      });

      dispatch({ type: 'SET_REGISTRATION_RESULT', result: res.data });
      dispatch({ type: 'SET_STEP', step: 4 });
    } catch (err) {
      const message =
        (err as { error?: { message?: string } })?.error?.message ?? t('registrationFailed');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [state, dispatch, t]);

  // ── Loading state ───────────────────────────────────────────────────────

  if (state.isLoading && !state.feePreview) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (state.error && !state.feePreview) {
    return (
      <div className="rounded-lg border border-danger-border bg-danger-fill p-4 text-center">
        <p className="text-sm text-danger-text">{state.error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            dispatch({ type: 'SET_ERROR', error: null });
            dispatch({ type: 'SET_FEE_PREVIEW', preview: state.feePreview as FeePreviewResult });
          }}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (!state.feePreview) return null;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Per-student fee sections ─────────────────────────────────── */}
      {visibleStudentFees.map((sp, spIdx) => {
        const student = state.students[sp.student_index];
        const studentName =
          student?.first_name && student?.last_name
            ? `${student.first_name} ${student.last_name}`
            : t('student', { number: sp.student_index + 1 });
        const subtotal = sp.fees.reduce((sum, f) => sum + f.annual_amount, 0);

        return (
          <div key={spIdx} className="rounded-lg border border-border-primary bg-surface-primary">
            {/* Student header */}
            <div className="flex items-center gap-3 border-b border-border-primary px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {sp.student_index + 1}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">{studentName}</span>
                <span className="text-xs text-text-tertiary">{sp.year_group_name}</span>
              </div>
            </div>

            {/* Fee lines */}
            <div className="divide-y divide-border-secondary">
              {sp.fees.map((fee) => (
                <div
                  key={fee.fee_structure_id}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <span className="text-sm text-text-secondary">{fee.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary" dir="ltr">
                      {formatCurrency(fee.annual_amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'REMOVE_FEE',
                          feeStructureId: fee.fee_structure_id,
                        })
                      }
                      className="rounded p-0.5 text-danger-text hover:bg-danger-fill"
                      title={t('remove')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {sp.fees.length === 0 && (
                <div className="px-4 py-3 text-center text-sm text-text-tertiary">
                  {t('noFeesAssigned')}
                </div>
              )}
            </div>

            {/* Subtotal */}
            {sp.fees.length > 0 && (
              <div className="flex items-center justify-between border-t border-border-primary bg-surface-secondary px-4 py-2.5">
                <span className="text-sm font-medium text-text-secondary">{t('subtotal')}</span>
                <span className="text-sm font-semibold text-text-primary" dir="ltr">
                  {formatCurrency(subtotal)}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Discounts section ────────────────────────────────────────── */}
      <div className="rounded-lg border border-border-primary bg-surface-primary">
        <div className="border-b border-border-primary px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('discounts')}</h3>
        </div>

        <div className="space-y-3 p-4">
          {/* Applied discounts */}
          {state.appliedDiscounts.map((d, idx) => {
            const disc = state.feePreview?.available_discounts.find(
              (ad) => ad.discount_id === d.discount_id,
            );
            if (!disc) return null;
            const discountAmount =
              disc.discount_type === 'fixed' ? disc.value : (feesTotal * disc.value) / 100;
            return (
              <div
                key={idx}
                className="flex items-center justify-between rounded bg-success-fill px-3 py-2"
              >
                <span className="text-sm text-success-text">{disc.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-success-text" dir="ltr">
                    -{formatCurrency(discountAmount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'REMOVE_DISCOUNT', index: idx })}
                    className="rounded p-0.5 text-success-text hover:text-danger-text"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Apply discount form */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>{t('applyDiscount')}</Label>
              <Select value={selectedDiscountId} onValueChange={setSelectedDiscountId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectDiscount')} />
                </SelectTrigger>
                <SelectContent>
                  {state.feePreview.available_discounts.map((disc) => (
                    <SelectItem key={disc.discount_id} value={disc.discount_id}>
                      {disc.name} (
                      {disc.discount_type === 'fixed'
                        ? formatCurrency(disc.value)
                        : `${disc.value}%`}
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedDiscountId}
              onClick={handleApplyDiscount}
            >
              <Plus className="me-1 h-3.5 w-3.5" />
              {t('apply')}
            </Button>
          </div>

          {/* Ad-hoc adjustments */}
          {state.adhocAdjustments.map((adj, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded bg-warning-fill px-3 py-2"
            >
              <span className="text-sm text-warning-text">{adj.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-warning-text" dir="ltr">
                  -{formatCurrency(adj.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'REMOVE_ADHOC_ADJUSTMENT', index: idx })}
                  className="rounded p-0.5 text-warning-text hover:text-danger-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Ad-hoc adjustment form */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>{t('adjustmentLabel')}</Label>
              <Input
                value={adjLabel}
                onChange={(e) => setAdjLabel(e.target.value)}
                placeholder={t('adjustmentLabelPlaceholder')}
              />
            </div>
            <div className="w-32 space-y-1.5">
              <Label>{t('amount')}</Label>
              <Input
                type="number"
                dir="ltr"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!adjLabel.trim() || !adjAmount || parseFloat(adjAmount) <= 0}
              onClick={handleAddAdjustment}
            >
              <Plus className="me-1 h-3.5 w-3.5" />
              {t('add')}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Grand total banner ───────────────────────────────────────── */}
      <div className="rounded-lg bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">{t('annualTotal')}</span>
          <span className="text-2xl font-bold text-white" dir="ltr">
            {formatCurrency(grandTotal)}
          </span>
        </div>
        {(discountsTotal > 0 || adjTotal > 0) && (
          <p className="mt-1 text-end text-xs text-gray-400" dir="ltr">
            {formatCurrency(feesTotal)} - {formatCurrency(discountsTotal + adjTotal)}{' '}
            {t('inDiscounts')}
          </p>
        )}
      </div>

      {/* ── Confirm button ───────────────────────────────────────────── */}
      <Button
        type="button"
        className="w-full bg-success-600 text-white hover:bg-success-700"
        disabled={isSubmitting || visibleStudentFees.every((sp) => sp.fees.length === 0)}
        onClick={handleConfirmRegister}
      >
        {isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
        {t('confirmRegister')}
      </Button>
    </div>
  );
}
