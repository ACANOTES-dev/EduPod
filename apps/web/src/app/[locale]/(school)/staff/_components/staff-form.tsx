'use client';

import { RefreshCw } from 'lucide-react';
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

const DEFAULT_VALUES: StaffFormValues = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  role_id: '',
  staff_number: '',
  job_title: '',
  employment_status: 'active',
  department: '',
  employment_type: 'full_time',
  bank_name: '',
  bank_account_number: '',
  bank_iban: '',
};

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

  const [values, setValues] = React.useState<StaffFormValues>(() => ({
    ...DEFAULT_VALUES,
    staff_number: generateStaffNumber(),
    ...initialValues,
  }));
  const [roles, setRoles] = React.useState<RoleOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    apiClient<{ data: RoleOption[] }>('/api/v1/roles')
      .then((res) => {
        const filtered = res.data.filter((r) => r.role_tier !== 'platform');
        setRoles(filtered);
      })
      .catch(() => setRoles([]));
  }, []);

  const set = (field: keyof StaffFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  const regenerateStaffNumber = () => {
    setValues((prev) => ({ ...prev, staff_number: generateStaffNumber() }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Personal Information — only shown on create */}
      {!isEdit && (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-text-primary">{t('sectionPersonal')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">{t('fieldFirstName')}</Label>
              <Input
                id="first_name"
                value={values.first_name}
                onChange={set('first_name')}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">{t('fieldLastName')}</Label>
              <Input id="last_name" value={values.last_name} onChange={set('last_name')} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('fieldEmail')}</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                value={values.email}
                onChange={set('email')}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t('fieldPhone')}</Label>
              <Input
                id="phone"
                type="tel"
                dir="ltr"
                value={values.phone}
                onChange={set('phone')}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role_id">{t('fieldRole')}</Label>
              <Select
                value={values.role_id}
                onValueChange={(v) => setValues((p) => ({ ...p, role_id: v }))}
              >
                <SelectTrigger id="role_id">
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff_number">{t('staffNumber')}</Label>
              <div className="flex gap-2">
                <Input
                  id="staff_number"
                  dir="ltr"
                  value={values.staff_number}
                  readOnly
                  className="font-mono tracking-wider bg-surface-secondary"
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
            <Input id="job_title" value={values.job_title} onChange={set('job_title')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="department">{t('fieldDepartment')}</Label>
            <Input id="department" value={values.department} onChange={set('department')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="employment_status">{t('fieldEmploymentStatus')}</Label>
            <Select
              value={values.employment_status}
              onValueChange={(v) => setValues((p) => ({ ...p, employment_status: v }))}
            >
              <SelectTrigger id="employment_status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('statusActive')}</SelectItem>
                <SelectItem value="inactive">{t('statusInactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="employment_type">{t('fieldEmploymentType')}</Label>
            <Select
              value={values.employment_type}
              onValueChange={(v) => setValues((p) => ({ ...p, employment_type: v }))}
            >
              <SelectTrigger id="employment_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">{t('typeFullTime')}</SelectItem>
                <SelectItem value="part_time">{t('typePartTime')}</SelectItem>
                <SelectItem value="contract">{t('typeContract')}</SelectItem>
              </SelectContent>
            </Select>
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
              <Input id="bank_name" value={values.bank_name} onChange={set('bank_name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank_account_number">{t('fieldBankAccountNumber')}</Label>
              <Input
                id="bank_account_number"
                value={values.bank_account_number}
                onChange={set('bank_account_number')}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bank_iban">{t('fieldBankIban')}</Label>
              <Input
                id="bank_iban"
                value={values.bank_iban}
                onChange={set('bank_iban')}
                dir="ltr"
              />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger-text">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            {tc('cancel')}
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? tc('loading') : (submitLabel ?? tc('save'))}
        </Button>
      </div>
    </form>
  );
}
