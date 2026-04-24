'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createStaffVettingSchema, type CreateStaffVettingDto } from '@school/shared/regulatory';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { VettingExpiryBadge } from '../_components/vetting-expiry-badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffVettingRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  vetting_type: 'garda_vetting' | 'international' | 'other';
  reference_number: string | null;
  vetting_date: string;
  expiry_date: string;
  days_remaining: number;
  status: 'active' | 'expiring_soon' | 'expired' | 'pending_renewal' | 'revoked';
  notes: string | null;
}

interface ListResponse {
  data: StaffVettingRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface StaffProfile {
  user: { id: string; first_name: string; last_name: string; email: string };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffVettingPage() {
  const t = useTranslations('regulatory.safeguarding.staffVetting');
  const locale = useLocale();

  const [records, setRecords] = React.useState<StaffVettingRow[]>([]);
  const [staff, setStaff] = React.useState<StaffProfile[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setDialogOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<ListResponse>(
        '/api/v1/regulatory/safeguarding/staff-vetting?page=1&pageSize=100',
        { silent: true },
      );
      setRecords(res.data);
    } catch (err) {
      console.error('[StaffVettingPage] fetch', err);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    apiClient<{ data: StaffProfile[] }>('/api/v1/staff-profiles?page=1&pageSize=200', {
      silent: true,
    })
      .then((res) => setStaff(res.data))
      .catch((err) => console.error('[StaffVettingPage] staff fetch', err));
  }, []);

  const handleDelete = async (row: StaffVettingRow) => {
    if (!window.confirm(t('confirmDelete', { name: row.user_name }))) return;
    try {
      await apiClient(`/api/v1/regulatory/safeguarding/staff-vetting/${row.id}`, {
        method: 'DELETE',
      });
      toast.success(t('deleted'));
      void refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('deleteFailed');
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        back={{ href: `/${locale}/regulatory/safeguarding`, label: t('backToSafeguarding') }}
        actions={
          <Button className="min-h-[44px]" onClick={() => setDialogOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('addRecord')}
          </Button>
        }
      />

      <div className="rounded-2xl border border-border bg-slate-50 px-4 py-4 sm:px-6">
        <p className="text-xs text-text-secondary leading-relaxed">{t('notice')}</p>
      </div>

      <section className="rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-text-primary">{t('tableTitle')}</h2>
        </header>
        {isLoading ? (
          <div className="px-4 py-8 text-sm text-text-tertiary sm:px-6">{t('loading')}</div>
        ) : records.length === 0 ? (
          <div className="px-4 py-8 sm:px-6">
            <EmptyState
              icon={BadgeCheck}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.name')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.type')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.reference')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.vettingDate')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.expiryDate')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.status')}</th>
                  <th className="px-4 py-2 text-end sm:px-6">{t('columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 sm:px-6">
                      <div className="font-medium text-text-primary">{r.user_name}</div>
                      <div className="font-mono text-xs text-text-tertiary">{r.user_email}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary sm:px-6">
                      {t(`type.${r.vetting_type}`)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary sm:px-6">
                      {r.reference_number ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary sm:px-6">
                      {new Date(r.vetting_date).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary sm:px-6">
                      {new Date(r.expiry_date).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <VettingExpiryBadge daysRemaining={r.days_remaining} />
                    </td>
                    <td className="px-4 py-3 text-end sm:px-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px] min-w-[44px]"
                        onClick={() => handleDelete(r)}
                        aria-label={t('delete')}
                      >
                        <Trash2 className="h-4 w-4 text-danger-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <VettingDialog
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        staff={staff}
        onCreated={() => {
          setDialogOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface VettingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffProfile[];
  onCreated: () => void;
}

function VettingDialog({ open, onOpenChange, staff, onCreated }: VettingDialogProps) {
  const t = useTranslations('regulatory.safeguarding.staffVetting');

  const form = useForm<CreateStaffVettingDto>({
    resolver: zodResolver(createStaffVettingSchema),
    defaultValues: {
      user_id: '',
      vetting_type: 'garda_vetting',
      reference_number: '',
      vetting_date: '',
      expiry_date: '',
      notes: '',
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        user_id: '',
        vetting_type: 'garda_vetting',
        reference_number: '',
        vetting_date: '',
        expiry_date: '',
        notes: '',
      });
    }
  }, [open, form]);

  const onSubmit = async (values: CreateStaffVettingDto) => {
    try {
      await apiClient('/api/v1/regulatory/safeguarding/staff-vetting', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast.success(t('created'));
      onCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('createFailed');
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription>{t('dialog.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user_id">{t('dialog.staffMember')}</Label>
            <Controller
              name="user_id"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="user_id">
                    <SelectValue placeholder={t('dialog.staffPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.user.id} value={s.user.id}>
                        {s.user.first_name} {s.user.last_name} ({s.user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.user_id && (
              <p className="text-xs text-danger-600">{form.formState.errors.user_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="vetting_type">{t('dialog.type')}</Label>
            <Controller
              name="vetting_type"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="vetting_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="garda_vetting">{t('type.garda_vetting')}</SelectItem>
                    <SelectItem value="international">{t('type.international')}</SelectItem>
                    <SelectItem value="other">{t('type.other')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference_number">{t('dialog.reference')}</Label>
            <Input id="reference_number" {...form.register('reference_number')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vetting_date">{t('dialog.vettingDate')}</Label>
              <Input id="vetting_date" type="date" {...form.register('vetting_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiry_date">{t('dialog.expiryDate')}</Label>
              <Input id="expiry_date" type="date" {...form.register('expiry_date')} />
              {form.formState.errors.expiry_date && (
                <p className="text-xs text-danger-600">
                  {form.formState.errors.expiry_date.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('dialog.notes')}</Label>
            <Textarea id="notes" rows={3} {...form.register('notes')} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="min-h-[44px]"
            >
              {t('dialog.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting} className="min-h-[44px]">
              {form.formState.isSubmitting ? t('dialog.saving') : t('dialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
