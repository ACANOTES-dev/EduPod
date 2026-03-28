'use client';

import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type {
  ConsentFormData,
  EmergencyContactData,
  ParentFormData,
  WizardAction,
  WizardState,
} from './types';

type AiConsentField = keyof ConsentFormData['ai_features'];

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateStep1(state: WizardState): Record<string, string> {
  const errors: Record<string, string> = {};
  const p = state.primaryParent;

  if (!p.first_name.trim()) errors['primary.first_name'] = 'Required';
  if (!p.last_name.trim()) errors['primary.last_name'] = 'Required';
  if (!p.phone.trim()) errors['primary.phone'] = 'Required';
  if (!p.relationship_label) errors['primary.relationship_label'] = 'Required';

  if (state.showSecondaryParent && state.secondaryParent) {
    const s = state.secondaryParent;
    if (!s.first_name.trim()) errors['secondary.first_name'] = 'Required';
    if (!s.last_name.trim()) errors['secondary.last_name'] = 'Required';
    if (!s.phone.trim()) errors['secondary.phone'] = 'Required';
    if (!s.relationship_label) errors['secondary.relationship_label'] = 'Required';
  }

  if (!state.household.address_line_1.trim()) errors['household.address_line_1'] = 'Required';
  if (!state.household.city.trim()) errors['household.city'] = 'Required';
  if (!state.household.country.trim()) errors['household.country'] = 'Required';

  state.emergencyContacts.forEach((ec, i) => {
    if (!ec.contact_name.trim()) errors[`emergency.${i}.contact_name`] = 'Required';
    if (!ec.phone.trim()) errors[`emergency.${i}.phone`] = 'Required';
    if (!ec.relationship_label.trim()) errors[`emergency.${i}.relationship_label`] = 'Required';
  });

  return errors;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface StepParentHouseholdProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RELATIONSHIP_OPTIONS = ['father', 'mother', 'guardian', 'other'] as const;
const AI_CONSENT_FIELDS: Array<{
  key: AiConsentField;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    key: 'ai_grading',
    labelKey: 'consentAiGrading',
    descriptionKey: 'consentAiGradingDescription',
  },
  {
    key: 'ai_comments',
    labelKey: 'consentAiComments',
    descriptionKey: 'consentAiCommentsDescription',
  },
  {
    key: 'ai_risk_detection',
    labelKey: 'consentAiRiskDetection',
    descriptionKey: 'consentAiRiskDetectionDescription',
  },
  {
    key: 'ai_progress_summary',
    labelKey: 'consentAiProgressSummary',
    descriptionKey: 'consentAiProgressSummaryDescription',
  },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function StepParentHousehold({ state, dispatch }: StepParentHouseholdProps) {
  const t = useTranslations('registration');

  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Auto-fill household_name when primary parent last_name changes
  const handlePrimaryChange = React.useCallback(
    (field: keyof ParentFormData, value: string) => {
      dispatch({ type: 'SET_PRIMARY_PARENT', data: { [field]: value } });
      if (field === 'last_name') {
        dispatch({
          type: 'SET_HOUSEHOLD',
          data: { household_name: value ? `${value} Family` : '' },
        });
      }
      // Clear field error on change
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`primary.${field}`];
        return next;
      });
    },
    [dispatch],
  );

  const handleSecondaryChange = React.useCallback(
    (field: keyof ParentFormData, value: string) => {
      dispatch({ type: 'SET_SECONDARY_PARENT', data: { [field]: value } });
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`secondary.${field}`];
        return next;
      });
    },
    [dispatch],
  );

  const handleHouseholdChange = React.useCallback(
    (field: string, value: string) => {
      dispatch({ type: 'SET_HOUSEHOLD', data: { [field]: value } });
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`household.${field}`];
        return next;
      });
    },
    [dispatch],
  );

  // ── Emergency Contact helpers ────────────────────────────────────────────

  const updateEmergencyContact = React.useCallback(
    (index: number, field: keyof EmergencyContactData, value: string) => {
      const updated = state.emergencyContacts.map((ec, i) =>
        i === index ? { ...ec, [field]: value } : ec,
      );
      dispatch({ type: 'SET_EMERGENCY_CONTACTS', contacts: updated });
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`emergency.${index}.${field}`];
        return next;
      });
    },
    [state.emergencyContacts, dispatch],
  );

  const addEmergencyContact = React.useCallback(() => {
    if (state.emergencyContacts.length >= 3) return;
    const updated: EmergencyContactData[] = [
      ...state.emergencyContacts,
      { contact_name: '', phone: '', relationship_label: '' },
    ];
    dispatch({ type: 'SET_EMERGENCY_CONTACTS', contacts: updated });
  }, [state.emergencyContacts, dispatch]);

  const toggleConsent = React.useCallback(
    (field: 'health_data' | 'whatsapp_channel') => {
      dispatch({
        type: 'SET_CONSENTS',
        data: {
          ...state.consents,
          [field]: !state.consents[field],
        },
      });
    },
    [dispatch, state.consents],
  );

  const toggleAiConsent = React.useCallback(
    (field: AiConsentField) => {
      dispatch({
        type: 'SET_CONSENTS',
        data: {
          ...state.consents,
          ai_features: {
            ...state.consents.ai_features,
            [field]: !state.consents.ai_features[field],
          },
        },
      });
    },
    [dispatch, state.consents],
  );

  const removeEmergencyContact = React.useCallback(
    (index: number) => {
      if (state.emergencyContacts.length <= 1) return;
      const updated = state.emergencyContacts.filter((_, i) => i !== index);
      dispatch({ type: 'SET_EMERGENCY_CONTACTS', contacts: updated });
    },
    [state.emergencyContacts, dispatch],
  );

  // ── Render helpers ───────────────────────────────────────────────────────

  function renderParentFields(
    parent: ParentFormData,
    prefix: 'primary' | 'secondary',
    onChange: (field: keyof ParentFormData, value: string) => void,
  ) {
    return (
      <div className="space-y-4">
        {/* Row 1: First Name / Last Name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-first-name`}>
              {t('firstName')} *
            </Label>
            <Input
              id={`${prefix}-first-name`}
              value={parent.first_name}
              onChange={(e) => onChange('first_name', e.target.value)}
            />
            {errors[`${prefix}.first_name`] && (
              <p className="text-xs text-danger-text">{errors[`${prefix}.first_name`]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-last-name`}>
              {t('lastName')} *
            </Label>
            <Input
              id={`${prefix}-last-name`}
              value={parent.last_name}
              onChange={(e) => onChange('last_name', e.target.value)}
            />
            {errors[`${prefix}.last_name`] && (
              <p className="text-xs text-danger-text">{errors[`${prefix}.last_name`]}</p>
            )}
          </div>
        </div>

        {/* Row 2: Email / Phone */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-email`}>
              {t('email')}
            </Label>
            <Input
              id={`${prefix}-email`}
              type="email"
              dir="ltr"
              value={parent.email}
              onChange={(e) => onChange('email', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-phone`}>
              {t('phone')} *
            </Label>
            <Input
              id={`${prefix}-phone`}
              type="tel"
              dir="ltr"
              value={parent.phone}
              onChange={(e) => onChange('phone', e.target.value)}
            />
            {errors[`${prefix}.phone`] && (
              <p className="text-xs text-danger-text">{errors[`${prefix}.phone`]}</p>
            )}
          </div>
        </div>

        {/* Row 3: Relationship */}
        <div className="space-y-1.5">
          <Label>{t('relationship')} *</Label>
          <Select
            value={parent.relationship_label}
            onValueChange={(val) => onChange('relationship_label', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('relationship')} />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_OPTIONS.map((rel) => (
                <SelectItem key={rel} value={rel}>
                  {t(rel)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors[`${prefix}.relationship_label`] && (
            <p className="text-xs text-danger-text">{errors[`${prefix}.relationship_label`]}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Section 1: Primary Parent / Guardian ────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-text-primary">
          {t('primaryParent')}
        </h3>
        {renderParentFields(state.primaryParent, 'primary', handlePrimaryChange)}
      </section>

      {/* ── Section 2: Second Parent (Optional) ─────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-text-primary">
          {t('secondParent')}
        </h3>

        {!state.showSecondaryParent ? (
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_SECONDARY_PARENT' })}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-primary px-4 py-6 text-sm font-medium text-text-secondary transition-colors hover:border-primary-300 hover:text-primary-600"
          >
            <Plus className="h-4 w-4" />
            {t('addSecondParent')}
          </button>
        ) : (
          <div className="space-y-4">
            {state.secondaryParent &&
              renderParentFields(state.secondaryParent, 'secondary', handleSecondaryChange)}
            <button
              type="button"
              onClick={() => dispatch({ type: 'TOGGLE_SECONDARY_PARENT' })}
              className="inline-flex items-center gap-1 text-sm text-danger-text hover:underline"
            >
              <X className="h-3.5 w-3.5" />
              {t('removeParent')}
            </button>
          </div>
        )}
      </section>

      {/* ── Section 3: Household ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-text-primary">
          {t('household')}
        </h3>

        <div className="space-y-4">
          {/* Household name (auto-derived) */}
          <div className="space-y-1.5">
            <Label htmlFor="household-name">{t('householdName')}</Label>
            <Input
              id="household-name"
              value={state.household.household_name}
              readOnly
              className="bg-surface-secondary"
            />
          </div>

          {/* Address Line 1 / Address Line 2 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="address-1">{t('addressLine1')} *</Label>
              <Input
                id="address-1"
                value={state.household.address_line_1}
                onChange={(e) => handleHouseholdChange('address_line_1', e.target.value)}
              />
              {errors['household.address_line_1'] && (
                <p className="text-xs text-danger-text">{errors['household.address_line_1']}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address-2">{t('addressLine2')}</Label>
              <Input
                id="address-2"
                value={state.household.address_line_2}
                onChange={(e) => handleHouseholdChange('address_line_2', e.target.value)}
              />
            </div>
          </div>

          {/* City / Country / Postal Code */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">{t('city')} *</Label>
              <Input
                id="city"
                value={state.household.city}
                onChange={(e) => handleHouseholdChange('city', e.target.value)}
              />
              {errors['household.city'] && (
                <p className="text-xs text-danger-text">{errors['household.city']}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">{t('country')} *</Label>
              <Input
                id="country"
                value={state.household.country}
                onChange={(e) => handleHouseholdChange('country', e.target.value)}
              />
              {errors['household.country'] && (
                <p className="text-xs text-danger-text">{errors['household.country']}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postal-code">{t('postalCode')}</Label>
              <Input
                id="postal-code"
                value={state.household.postal_code}
                onChange={(e) => handleHouseholdChange('postal_code', e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 4: Emergency Contacts ─────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-text-primary">
          {t('emergencyContact')}
        </h3>

        <div className="space-y-3">
          {state.emergencyContacts.map((ec, index) => (
            <div key={index} className="space-y-3 rounded-lg border border-border-primary p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`ec-name-${index}`}>{t('contactName')} *</Label>
                  <Input
                    id={`ec-name-${index}`}
                    value={ec.contact_name}
                    onChange={(e) =>
                      updateEmergencyContact(index, 'contact_name', e.target.value)
                    }
                  />
                  {errors[`emergency.${index}.contact_name`] && (
                    <p className="text-xs text-danger-text">
                      {errors[`emergency.${index}.contact_name`]}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ec-phone-${index}`}>{t('phone')} *</Label>
                  <Input
                    id={`ec-phone-${index}`}
                    type="tel"
                    dir="ltr"
                    value={ec.phone}
                    onChange={(e) =>
                      updateEmergencyContact(index, 'phone', e.target.value)
                    }
                  />
                  {errors[`emergency.${index}.phone`] && (
                    <p className="text-xs text-danger-text">
                      {errors[`emergency.${index}.phone`]}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ec-rel-${index}`}>{t('relationship')} *</Label>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        id={`ec-rel-${index}`}
                        value={ec.relationship_label}
                        onChange={(e) =>
                          updateEmergencyContact(index, 'relationship_label', e.target.value)
                        }
                      />
                    </div>
                    {state.emergencyContacts.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEmergencyContact(index)}
                        className="text-danger-text hover:text-danger-text"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {errors[`emergency.${index}.relationship_label`] && (
                    <p className="text-xs text-danger-text">
                      {errors[`emergency.${index}.relationship_label`]}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

      {state.emergencyContacts.length < 3 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addEmergencyContact}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            {t('addEmergencyContact')}
          </Button>
        )}
      </section>

      {/* ── Section 5: Privacy & Consent ─────────────────────────────── */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-text-primary">
            {t('consentTitle')}
          </h3>
          <p className="text-sm text-text-secondary">
            {t('consentDescription')}
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border-primary bg-surface-primary p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="consent-health-data"
              checked={state.consents.health_data}
              onCheckedChange={() => toggleConsent('health_data')}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="consent-health-data" className="cursor-pointer text-sm font-medium">
                {t('consentHealthData')}
              </Label>
              <p className="text-xs text-text-tertiary">
                {t('consentHealthDataDescription')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 border-t border-border-secondary pt-3">
            <Checkbox
              id="consent-whatsapp"
              checked={state.consents.whatsapp_channel}
              onCheckedChange={() => toggleConsent('whatsapp_channel')}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="consent-whatsapp" className="cursor-pointer text-sm font-medium">
                {t('consentWhatsApp')}
              </Label>
              <p className="text-xs text-text-tertiary">
                {t('consentWhatsAppDescription')}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border-primary bg-surface-primary p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-text-primary">
              {t('consentAiTitle')}
            </p>
            <p className="text-xs text-text-tertiary">
              {t('consentAiDescription')}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {AI_CONSENT_FIELDS.map((field) => (
              <label
                key={field.key}
                htmlFor={`consent-${field.key}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-secondary bg-surface-secondary px-3 py-3"
              >
                <Checkbox
                  id={`consent-${field.key}`}
                  checked={state.consents.ai_features[field.key]}
                  onCheckedChange={() => toggleAiConsent(field.key)}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-text-primary">
                    {t(field.labelKey)}
                  </span>
                  <span className="block text-xs text-text-tertiary">
                    {t(field.descriptionKey)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
