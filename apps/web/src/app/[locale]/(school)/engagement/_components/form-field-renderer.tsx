'use client';

import * as React from 'react';

import type { EngagementFormField } from '@school/shared/engagement';
import {
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';

import { ESignaturePad } from './e-signature-pad';
import {
  getFieldHelpText,
  getFieldLabel,
  parseFieldOptions,
  shouldRenderField,
  type SignatureValue,
} from './engagement-types';

interface FormFieldRendererProps {
  field: EngagementFormField;
  locale: string;
  values?: Record<string, unknown>;
  value?: unknown;
  onChange?: (value: unknown) => void;
  signatureValue?: SignatureValue | null;
  onSignatureChange?: (value: SignatureValue | null) => void;
  disabled?: boolean;
  preview?: boolean;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function FormFieldRenderer({
  field,
  locale,
  values = {},
  value,
  onChange,
  signatureValue,
  onSignatureChange,
  disabled = false,
  preview = false,
}: FormFieldRendererProps) {
  const label = getFieldLabel(field, locale);
  const helpText = getFieldHelpText(field, locale);
  const options = parseFieldOptions(field);

  if (!shouldRenderField(field, values)) {
    return null;
  }

  if (field.field_type === 'info_block') {
    return (
      <section className="rounded-3xl border border-border bg-surface-secondary/70 p-4">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {helpText ||
            (locale === 'ar'
              ? 'معلومة إضافية لهذا النموذج.'
              : 'Additional guidance for this form.')}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={field.field_key}>
        {label}
        {field.required ? <span className="ms-1 text-danger-text">*</span> : null}
      </Label>
      {helpText ? <p className="text-sm text-text-secondary">{helpText}</p> : null}

      {field.field_type === 'short_text' ||
      field.field_type === 'email' ||
      field.field_type === 'phone' ||
      field.field_type === 'country' ? (
        <Input
          id={field.field_key}
          type={
            field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'
          }
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          readOnly={preview}
          onChange={(event) => onChange?.(event.target.value)}
          className="min-h-12 text-base"
        />
      ) : null}

      {field.field_type === 'long_text' ? (
        <Textarea
          id={field.field_key}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          readOnly={preview}
          onChange={(event) => onChange?.(event.target.value)}
          className="min-h-28 text-base"
        />
      ) : null}

      {field.field_type === 'number' ? (
        <Input
          id={field.field_key}
          type="number"
          value={typeof value === 'number' || typeof value === 'string' ? value : ''}
          disabled={disabled}
          readOnly={preview}
          onChange={(event) => onChange?.(event.target.value ? Number(event.target.value) : '')}
          className="min-h-12 text-base"
        />
      ) : null}

      {field.field_type === 'date' ? (
        <Input
          id={field.field_key}
          type="date"
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          readOnly={preview}
          onChange={(event) => onChange?.(event.target.value)}
          className="min-h-12 text-base"
        />
      ) : null}

      {field.field_type === 'boolean' ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
          <Checkbox
            id={`${field.field_key}-checkbox`}
            checked={Boolean(value)}
            disabled={disabled || preview}
            onCheckedChange={(checked) => onChange?.(Boolean(checked))}
          />
          <Label htmlFor={`${field.field_key}-checkbox`} className="text-sm font-medium">
            {locale === 'ar' ? 'تأكيد' : 'Confirm'}
          </Label>
        </div>
      ) : null}

      {field.field_type === 'yes_no' ? (
        <Select
          value={typeof value === 'string' ? value : ''}
          disabled={disabled || preview}
          onValueChange={(nextValue) => onChange?.(nextValue)}
        >
          <SelectTrigger className="min-h-12 text-base">
            <SelectValue placeholder={locale === 'ar' ? 'اختر' : 'Choose'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">{locale === 'ar' ? 'نعم' : 'Yes'}</SelectItem>
            <SelectItem value="no">{locale === 'ar' ? 'لا' : 'No'}</SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      {field.field_type === 'single_select' ? (
        <Select
          value={typeof value === 'string' ? value : ''}
          disabled={disabled || preview}
          onValueChange={(nextValue) => onChange?.(nextValue)}
        >
          <SelectTrigger className="min-h-12 text-base">
            <SelectValue placeholder={locale === 'ar' ? 'اختر' : 'Choose'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {field.field_type === 'multi_select' ? (
        <div className="space-y-2 rounded-2xl border border-border p-4">
          {options.map((option) => {
            const currentValue = Array.isArray(value) ? value : [];
            const checked = currentValue.includes(option.value);

            return (
              <label
                key={option.value}
                className="flex items-center gap-3 text-sm text-text-primary"
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled || preview}
                  onCheckedChange={(nextChecked) => {
                    const nextValue = new Set(
                      (Array.isArray(value) ? value : []).map((item) => String(item)),
                    );

                    if (nextChecked) {
                      nextValue.add(option.value);
                    } else {
                      nextValue.delete(option.value);
                    }

                    onChange?.([...nextValue]);
                  }}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}

      {field.field_type === 'file_upload' ? (
        <Input
          id={field.field_key}
          type="file"
          disabled={disabled || preview}
          className="min-h-12 text-base"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              onChange?.(null);
              return;
            }

            const dataUrl = await readFileAsDataUrl(file);
            onChange?.({
              name: file.name,
              type: file.type,
              size: file.size,
              data: dataUrl,
            });
          }}
        />
      ) : null}

      {field.field_type === 'signature' ? (
        <ESignaturePad
          locale={locale}
          legalText={
            helpText ||
            (locale === 'ar'
              ? 'أؤكد أن هذا التوقيع يعبر عن إرادتي.'
              : 'I confirm this signature represents my intent.')
          }
          value={signatureValue ?? null}
          disabled={disabled || preview}
          onChange={(nextValue) => {
            onSignatureChange?.(nextValue);
            if (nextValue) {
              onChange?.(nextValue.data);
            }
          }}
        />
      ) : null}
    </div>
  );
}
