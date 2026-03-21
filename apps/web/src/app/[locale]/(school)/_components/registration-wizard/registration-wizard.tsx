'use client';

import { Button, Dialog, DialogContent } from '@school/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useReducer } from 'react';

import type { WizardAction, WizardState } from './types';
import { EMPTY_PARENT, EMPTY_STUDENT } from './types';
import { StepParentHousehold, validateStep1 } from './step-parent-household';
import { StepStudents, validateStep2 } from './step-students';
import { StepFeeSummary } from './step-fee-summary';
import { StepPayment } from './step-payment';
import { StepComplete } from './step-complete';

// ─── Initial state ───────────────────────────────────────────────────────────

const initialState: WizardState = {
  step: 1,
  primaryParent: { ...EMPTY_PARENT },
  secondaryParent: null,
  showSecondaryParent: false,
  household: {
    household_name: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    country: '',
    postal_code: '',
  },
  emergencyContacts: [],
  students: [{ ...EMPTY_STUDENT }],
  expandedStudentIndex: 0,
  feePreview: null,
  removedFees: [],
  appliedDiscounts: [],
  adhocAdjustments: [],
  registrationResult: null,
  paymentResult: null,
  isLoading: false,
  error: null,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step, error: null };

    case 'SET_PRIMARY_PARENT':
      return {
        ...state,
        primaryParent: { ...state.primaryParent, ...action.data },
      };

    case 'SET_SECONDARY_PARENT':
      return {
        ...state,
        secondaryParent: action.data
          ? {
              ...(state.secondaryParent ?? { ...EMPTY_PARENT }),
              ...action.data,
            }
          : null,
      };

    case 'TOGGLE_SECONDARY_PARENT':
      return {
        ...state,
        showSecondaryParent: !state.showSecondaryParent,
        secondaryParent: state.showSecondaryParent
          ? null
          : { ...EMPTY_PARENT },
      };

    case 'SET_HOUSEHOLD':
      return {
        ...state,
        household: { ...state.household, ...action.data },
      };

    case 'SET_EMERGENCY_CONTACTS':
      return { ...state, emergencyContacts: action.contacts };

    case 'ADD_STUDENT':
      return {
        ...state,
        students: [...state.students, { ...EMPTY_STUDENT }],
        expandedStudentIndex: state.students.length,
      };

    case 'REMOVE_STUDENT': {
      if (state.students.length <= 1) return state;
      const filtered = state.students.filter((_, i) => i !== action.index);
      return {
        ...state,
        students: filtered,
        expandedStudentIndex: Math.min(
          state.expandedStudentIndex,
          filtered.length - 1,
        ),
      };
    }

    case 'UPDATE_STUDENT':
      return {
        ...state,
        students: state.students.map((s, i) =>
          i === action.index ? { ...s, ...action.data } : s,
        ),
      };

    case 'SET_EXPANDED_STUDENT':
      return { ...state, expandedStudentIndex: action.index };

    case 'SET_FEE_PREVIEW':
      return {
        ...state,
        feePreview: action.preview,
        removedFees: [],
        appliedDiscounts: [],
        adhocAdjustments: [],
      };

    case 'REMOVE_FEE':
      return {
        ...state,
        removedFees: [...state.removedFees, action.feeStructureId],
      };

    case 'RESTORE_FEE':
      return {
        ...state,
        removedFees: state.removedFees.filter(
          (id) => id !== action.feeStructureId,
        ),
      };

    case 'ADD_DISCOUNT':
      return {
        ...state,
        appliedDiscounts: [
          ...state.appliedDiscounts,
          {
            discount_id: action.discount_id,
            fee_assignment_index: action.fee_assignment_index,
          },
        ],
      };

    case 'REMOVE_DISCOUNT':
      return {
        ...state,
        appliedDiscounts: state.appliedDiscounts.filter(
          (_, i) => i !== action.index,
        ),
      };

    case 'ADD_ADHOC_ADJUSTMENT':
      return {
        ...state,
        adhocAdjustments: [
          ...state.adhocAdjustments,
          { label: action.label, amount: action.amount },
        ],
      };

    case 'REMOVE_ADHOC_ADJUSTMENT':
      return {
        ...state,
        adhocAdjustments: state.adhocAdjustments.filter(
          (_, i) => i !== action.index,
        ),
      };

    case 'SET_REGISTRATION_RESULT':
      return { ...state, registrationResult: action.result };

    case 'SET_PAYMENT_RESULT':
      return { ...state, paymentResult: action.result };

    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'RESET':
      return {
        ...initialState,
        primaryParent: { ...EMPTY_PARENT },
        household: { ...initialState.household },
        students: [{ ...EMPTY_STUDENT }],
      };

    default:
      return state;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface RegistrationWizardProps {
  open: boolean;
  onClose: () => void;
}

export function RegistrationWizard({ open, onClose }: RegistrationWizardProps) {
  const t = useTranslations('registration');
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const handleClose = useCallback(() => {
    const hasData =
      state.primaryParent.first_name || state.students[0]?.first_name;
    if (hasData && state.step < 5) {
      if (!window.confirm(t('confirmClose'))) return;
    }
    dispatch({ type: 'RESET' });
    onClose();
  }, [state, onClose, t]);

  const stepLabels = [
    t('stepParentHousehold'),
    t('stepStudents'),
    t('stepFeeSummary'),
    t('stepPayment'),
    t('stepComplete'),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent className="max-w-[90vw] w-[90vw] max-h-[90vh] h-[90vh] flex flex-col overflow-hidden p-0">
        {/* Header with progress */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('title')}
          </h2>
          <div className="mt-3 flex gap-1">
            {([1, 2, 3, 4, 5] as const).map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  s <= state.step ? 'bg-primary-600' : 'bg-border'
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('stepIndicator', {
              current: state.step,
              total: 5,
              label: stepLabels[state.step - 1],
            })}
          </p>
        </div>

        {/* Content area — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {state.step === 1 && <StepParentHousehold state={state} dispatch={dispatch} />}
          {state.step === 2 && <StepStudents state={state} dispatch={dispatch} />}
          {state.step === 3 && <StepFeeSummary state={state} dispatch={dispatch} />}
          {state.step === 4 && <StepPayment state={state} dispatch={dispatch} />}
          {state.step === 5 && <StepComplete state={state} dispatch={dispatch} onClose={handleClose} />}
        </div>

        {/* Footer with navigation — only on steps 1 and 2 (steps 3-5 have their own buttons) */}
        {state.step <= 2 && (
          <div className="shrink-0 border-t border-border px-6 py-4 flex justify-between">
            {state.step > 1 ? (
              <Button
                variant="outline"
                onClick={() =>
                  dispatch({
                    type: 'SET_STEP',
                    step: (state.step - 1) as WizardState['step'],
                  })
                }
              >
                {t('back')}
              </Button>
            ) : (
              <Button variant="outline" onClick={handleClose}>
                {t('cancel')}
              </Button>
            )}
            <Button
              onClick={() => {
                if (state.step === 1) {
                  const errors = validateStep1(state);
                  if (Object.keys(errors).length > 0) return;
                  dispatch({ type: 'SET_STEP', step: 2 });
                } else if (state.step === 2) {
                  if (!validateStep2(state)) return;
                  dispatch({ type: 'SET_STEP', step: 3 });
                }
              }}
            >
              {state.step === 1 ? t('nextStudents') : t('nextFeeSummary')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
