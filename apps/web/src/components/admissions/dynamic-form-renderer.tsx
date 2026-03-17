'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Input,
  Textarea,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  RadioGroup,
  RadioGroupItem,
} from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDef {
  field_key: string;
  label: string;
  help_text?: string | null;
  field_type: string;
  required: boolean;
  options_json?: Array<{ value: string; label: string }> | null;
  conditional_visibility_json?: {
    depends_on_field_key: string;
    show_when_value: string | string[];
  } | null;
  display_order: number;
}

interface DynamicFormRendererProps {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  readOnly?: boolean;
}

// ─── Country list (common countries first, then alphabetical) ────────────────

const COUNTRIES = [
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'KW', label: 'Kuwait' },
  { value: 'BH', label: 'Bahrain' },
  { value: 'QA', label: 'Qatar' },
  { value: 'OM', label: 'Oman' },
  { value: 'JO', label: 'Jordan' },
  { value: 'EG', label: 'Egypt' },
  { value: 'LB', label: 'Lebanon' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
  { value: 'IN', label: 'India' },
  { value: 'PK', label: 'Pakistan' },
  { value: 'PH', label: 'Philippines' },
  { value: 'AU', label: 'Australia' },
  { value: 'CA', label: 'Canada' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'BD', label: 'Bangladesh' },
  { value: 'LK', label: 'Sri Lanka' },
  { value: 'NP', label: 'Nepal' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'KE', label: 'Kenya' },
  { value: 'TR', label: 'Turkey' },
  { value: 'IR', label: 'Iran' },
  { value: 'IQ', label: 'Iraq' },
  { value: 'SY', label: 'Syria' },
  { value: 'PS', label: 'Palestine' },
  { value: 'SD', label: 'Sudan' },
  { value: 'YE', label: 'Yemen' },
  { value: 'LY', label: 'Libya' },
  { value: 'TN', label: 'Tunisia' },
  { value: 'MA', label: 'Morocco' },
  { value: 'DZ', label: 'Algeria' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFieldVisible(
  field: FieldDef,
  values: Record<string, unknown>,
): boolean {
  const cond = field.conditional_visibility_json;
  if (!cond) return true;

  const depValue = values[cond.depends_on_field_key];
  if (Array.isArray(cond.show_when_value)) {
    return cond.show_when_value.includes(String(depValue ?? ''));
  }
  return String(depValue ?? '') === cond.show_when_value;
}

// ─── Field Renderer ───────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onFieldChange,
  readOnly,
}: {
  field: FieldDef;
  value: unknown;
  onFieldChange: (key: string, val: unknown) => void;
  readOnly?: boolean;
}) {
  const stringVal = value != null ? String(value) : '';

  switch (field.field_type) {
    case 'short_text':
      return (
        <Input
          value={stringVal}
          onChange={(e) => onFieldChange(field.field_key, e.target.value)}
          disabled={readOnly}
          required={field.required}
        />
      );

    case 'long_text':
      return (
        <Textarea
          value={stringVal}
          onChange={(e) => onFieldChange(field.field_key, e.target.value)}
          disabled={readOnly}
          required={field.required}
          rows={4}
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={stringVal}
          onChange={(e) => onFieldChange(field.field_key, e.target.value ? Number(e.target.value) : '')}
          disabled={readOnly}
          required={field.required}
        />
      );

    case 'date':
      return (
        <Input
          type="date"
          value={stringVal}
          onChange={(e) => onFieldChange(field.field_key, e.target.value)}
          disabled={readOnly}
          required={field.required}
          dir="ltr"
        />
      );

    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`field-${field.field_key}`}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onFieldChange(field.field_key, checked)}
            disabled={readOnly}
          />
          <Label htmlFor={`field-${field.field_key}`} className="text-sm text-text-secondary">
            {field.label}
          </Label>
        </div>
      );

    case 'single_select':
      return (
        <Select
          value={stringVal}
          onValueChange={(val) => onFieldChange(field.field_key, val)}
          disabled={readOnly}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Select ${field.label}`} />
          </SelectTrigger>
          <SelectContent>
            {(field.options_json ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'multi_select': {
      const selectedValues = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2">
          {(field.options_json ?? []).map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={`field-${field.field_key}-${opt.value}`}
                checked={selectedValues.includes(opt.value)}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? [...selectedValues, opt.value]
                    : selectedValues.filter((v) => v !== opt.value);
                  onFieldChange(field.field_key, next);
                }}
                disabled={readOnly}
              />
              <Label
                htmlFor={`field-${field.field_key}-${opt.value}`}
                className="text-sm text-text-secondary"
              >
                {opt.label}
              </Label>
            </div>
          ))}
        </div>
      );
    }

    case 'phone':
      return (
        <Input
          type="tel"
          dir="ltr"
          value={stringVal}
          onChange={(e) => onFieldChange(field.field_key, e.target.value)}
          disabled={readOnly}
          required={field.required}
          placeholder="+971 50 000 0000"
        />
      );

    case 'email':
      return (
        <Input
          type="email"
          dir="ltr"
          value={stringVal}
          onChange={(e) => onFieldChange(field.field_key, e.target.value)}
          disabled={readOnly}
          required={field.required}
          placeholder="name@example.com"
        />
      );

    case 'country':
      return (
        <Select
          value={stringVal}
          onValueChange={(val) => onFieldChange(field.field_key, val)}
          disabled={readOnly}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'yes_no':
      return (
        <RadioGroup
          value={stringVal}
          onValueChange={(val) => onFieldChange(field.field_key, val)}
          disabled={readOnly}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id={`field-${field.field_key}-yes`} />
            <Label htmlFor={`field-${field.field_key}-yes`} className="text-sm">
              Yes
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id={`field-${field.field_key}-no`} />
            <Label htmlFor={`field-${field.field_key}-no`} className="text-sm">
              No
            </Label>
          </div>
        </RadioGroup>
      );

    default:
      return (
        <Input
          value={stringVal}
          onChange={(e) => onFieldChange(field.field_key, e.target.value)}
          disabled={readOnly}
          required={field.required}
        />
      );
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DynamicFormRenderer({
  fields,
  values,
  onChange,
  readOnly = false,
}: DynamicFormRendererProps) {
  const t = useTranslations('admissions');

  const sortedFields = React.useMemo(
    () => [...fields].sort((a, b) => a.display_order - b.display_order),
    [fields],
  );

  const handleFieldChange = React.useCallback(
    (key: string, val: unknown) => {
      onChange({ ...values, [key]: val });
    },
    [values, onChange],
  );

  return (
    <div className="space-y-5">
      {sortedFields.map((field) => {
        if (!isFieldVisible(field, values)) return null;

        // For boolean, the label is rendered inline with the checkbox
        if (field.field_type === 'boolean') {
          return (
            <div key={field.field_key} className="space-y-1">
              <FieldRenderer
                field={field}
                value={values[field.field_key]}
                onFieldChange={handleFieldChange}
                readOnly={readOnly}
              />
              {field.help_text && (
                <p className="text-xs text-text-tertiary">{field.help_text}</p>
              )}
            </div>
          );
        }

        return (
          <div key={field.field_key} className="space-y-1.5">
            <Label htmlFor={`field-${field.field_key}`}>
              {field.label}
              {field.required && (
                <span className="ms-0.5 text-emerald-600">*</span>
              )}
            </Label>
            <FieldRenderer
              field={field}
              value={values[field.field_key]}
              onFieldChange={handleFieldChange}
              readOnly={readOnly}
            />
            {field.help_text && (
              <p className="text-xs text-text-tertiary">{field.help_text}</p>
            )}
          </div>
        );
      })}

      {sortedFields.length === 0 && (
        <p className="py-8 text-center text-sm text-text-tertiary">
          {t('noFormsYet')}
        </p>
      )}
    </div>
  );
}
