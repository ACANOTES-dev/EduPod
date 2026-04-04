'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createStaffProfileSchema, updateStaffProfileSchema } from '@school/shared';
import type { CreateStaffProfileDto } from '@school/shared';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleOption {
  id: string;
  display_name: string;
  role_tier: string;
}

export interface StaffFormValues {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role_id: string;
  staff_number: string;
  job_title: string;
  employment_status: string;
  department: string;
  employment_type: string;
  bank_name: string;
  bank_account_number: string;
  bank_iban: string;
}

interface StaffFormProps {
  initialValues?: Partial<StaffFormValues>;
  onSubmit: (values: StaffFormValues) => Promise<void>;
  isEdit?: boolean;
  showBankDetails?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

// ─── Staff Number Generator ──────────────────────────────────────────────────

function generateStaffNumber(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letterPart = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * 26)]).join(
    '',
  );
  const numberPart = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const lastDigit = Math.floor(Math.random() * 10);
  return `${letterPart}${numberPart}-${lastDigit}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StaffForm({
  initialValues,
  onSubmit,
  isEdit = false,
  showBankDetails = true,
  submitLabel,
  onCancel,
}: StaffFormProps) {
  const t = useTranslations('staff');
  const tc = useTranslations('common');

  // staff_number is not in the Zod schema (it is auto-generated and sent separately by the
  // parent caller). Keep it as local state so it can be regenerated without touching the form.
  const [staffNumber, setStaffNumber] = React.useState<string>(
    () => initialValues?.staff_number ?? generateStaffNumber(),
  );
  const [roles, setRoles] = React.useState<RoleOption[]>([]);
  const [apiError, setApiError] = React.useState('');

  // ─── Form setup ─────────────────────────────────────────────────────────────

  // Edit mode uses updateStaffProfileSchema (all fields optional).
  // Create mode uses createStaffProfileSchema (required fields enforced).
  const schema = isEdit ? updateStaffProfileSchema : createStaffProfileSchema;

  const form = useForm<CreateStaffProfileDto>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: initialValues?.first_name ?? '',
      last_name: initialValues?.last_name ?? '',
      email: initialValues?.email ?? '',
      phone: initialValues?.phone ?? '',
      role_id: initialValues?.role_id ?? '',
      job_title: initialValues?.job_title ?? '',
      employment_status: (initialValues?.employment_status as 'active' | 'inactive') ?? 'active',
      department: initialValues?.department ?? '',
      employment_type:
        (initialValues?.employment_type as 'full_time' | 'part_time' | 'contract' | 'substitute') ??
        'full_time',
      bank_name: initialValues?.bank_name ?? '',
      bank_account_number: initialValues?.bank_account_number ?? '',
      bank_iban: initialValues?.bank_iban ?? '',
    },
  });

  // ─── Data fetching ───────────────────────────────────────────────────────────

  React.useEffect(() => {
    apiClient<{ data: RoleOption[] }>('/api/v1/roles')
      .then((res) => {
        const filtered = res.data.filter((r) => r.role_tier !== 'platform');
        setRoles(filtered);
      })
      .catch((err) => { console.error('[StaffForm]', err); return setRoles([]); });
  }, []);

  // ─── Staff number regeneration ───────────────────────────────────────────────

  const regenerateStaffNumber = () => {
    setStaffNumber(generateStaffNumber());
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = form.handleSubmit(async (values) => {
    setApiError('');
    try {
      // Merge staff_number (local state) back into the values passed to the parent.
      // The parent is typed against StaffFormValues which includes staff_number.
      await onSubmit({ ...values, staff_number: staffNumber } as unknown as StaffFormValues);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setApiError(ex?.error?.message ?? tc('errorGeneric'));
    }
  });

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      {/* Personal Information — only shown on create */}
      {!isEdit && (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-text-primary">{t('sectionPersonal')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">{t('fieldFirstName')}</Label>
              <Input id="first_name" {...form.register('first_name')} className="text-base" />
              {form.formState.errors.first_name && (
                <p className="text-xs text-danger-text">
                  {form.formState.errors.first_name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">{t('fieldLastName')}</Label>
              <Input id="last_name" {...form.register('last_name')} className="text-base" />
              {form.formState.errors.last_name && (
                <p className="text-xs text-danger-text">
                  {form.formState.errors.last_name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('fieldEmail')}</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                {...form.register('email')}
                className="text-base"
              />
              {form.formState.errors.email && (
                <p className="text-xs text-danger-text">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t('fieldPhone')}</Label>
              <Input
                id="phone"
                type="tel"
                dir="ltr"
                {...form.register('phone')}
                className="text-base"
              />
              {form.formState.errors.phone && (
                <p className="text-xs text-danger-text">{form.formState.errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role_id">{t('fieldRole')}</Label>
              <Controller
                control={form.control}
                name="role_id"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="role_id" className="text-base">
                      <SelectValue placeholder={t('selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.role_id && (
                <p className="text-xs text-danger-text">{form.formState.errors.role_id.message}</p>
              )}
            </div>

            {/* staff_number lives outside the Zod schema — managed as local state */}
            <div className="space-y-1.5">
              <Label htmlFor="staff_number">{t('staffNumber')}</Label>
              <div className="flex gap-2">
                <Input
                  id="staff_number"
                  dir="ltr"
                  value={staffNumber}
                  readOnly
                  className="font-mono tracking-wider bg-surface-secondary text-base"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={regenerateStaffNumber}
                  title={t('regenerateStaffNumber')}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-text-tertiary">{t('staffNumberHint')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Employment details */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">{t('sectionBasic')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="job_title">{t('fieldJobTitle')}</Label>
            <Input id="job_title" {...form.register('job_title')} className="text-base" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="department">{t('fieldDepartment')}</Label>
            <Input id="department" {...form.register('department')} className="text-base" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="employment_status">{t('fieldEmploymentStatus')}</Label>
            <Controller
              control={form.control}
              name="employment_status"
              render={({ field }) => (
                <Select value={field.value ?? 'active'} onValueChange={field.onChange}>
                  <SelectTrigger id="employment_status" className="text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('statusActive')}</SelectItem>
                    <SelectItem value="inactive">{t('statusInactive')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="employment_type">{t('fieldEmploymentType')}</Label>
            <Controller
              control={form.control}
              name="employment_type"
              render={({ field }) => (
                <Select value={field.value ?? 'full_time'} onValueChange={field.onChange}>
                  <SelectTrigger id="employment_type" className="text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">{t('typeFullTime')}</SelectItem>
                    <SelectItem value="part_time">{t('typePartTime')}</SelectItem>
                    <SelectItem value="contract">{t('typeContract')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </div>

      {/* Bank details */}
      {showBankDetails && (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-text-primary">{t('sectionBank')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bank_name">{t('fieldBankName')}</Label>
              <Input id="bank_name" {...form.register('bank_name')} className="text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank_account_number">{t('fieldBankAccountNumber')}</Label>
              <Input
                id="bank_account_number"
                {...form.register('bank_account_number')}
                dir="ltr"
                className="text-base"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bank_iban">{t('fieldBankIban')}</Label>
              <Input
                id="bank_iban"
                {...form.register('bank_iban')}
                dir="ltr"
                className="text-base"
              />
            </div>
          </div>
        </div>
      )}

      {apiError && <p className="text-sm text-danger-text">{apiError}</p>}

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={form.formState.isSubmitting}
          >
            {tc('cancel')}
          </Button>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? tc('loading') : (submitLabel ?? tc('save'))}
        </Button>
      </div>
    </form>
  );
}
