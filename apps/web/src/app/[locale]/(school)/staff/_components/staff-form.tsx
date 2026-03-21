'use client';

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
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MembershipResponse {
  id: string;
  user_id: string;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface UserOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface StaffFormValues {
  user_id: string;
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

const DEFAULT_VALUES: StaffFormValues = {
  user_id: '',
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

  const [values, setValues] = React.useState<StaffFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });
  const [users, setUsers] = React.useState<UserOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    apiClient<{ data: MembershipResponse[] }>('/api/v1/users?pageSize=100')
      .then((res) => {
        const mapped = res.data.map((m) => ({
          id: m.user?.id ?? m.user_id ?? m.id,
          first_name: m.user?.first_name ?? '',
          last_name: m.user?.last_name ?? '',
          email: m.user?.email ?? '',
        }));
        setUsers(mapped);
      })
      .catch(() => setUsers([]));
  }, []);

  const set = (field: keyof StaffFormValues) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setValues((prev) => ({ ...prev, [field]: e.target.value }));

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
      {/* Core fields */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">{t('sectionBasic')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* User selector — locked on edit */}
          {!isEdit && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="user_id">{t('fieldUser')}</Label>
              <Select
                value={values.user_id}
                onValueChange={(v) => setValues((p) => ({ ...p, user_id: v }))}
              >
                <SelectTrigger id="user_id">
                  <SelectValue placeholder={t('selectUser')} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
