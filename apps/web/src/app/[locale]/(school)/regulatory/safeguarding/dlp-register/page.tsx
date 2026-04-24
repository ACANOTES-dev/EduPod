'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, UserX } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createDlpEntrySchema, type CreateDlpEntryDto } from '@school/shared/regulatory';
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
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DlpEntry {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role: 'designated_liaison' | 'deputy_liaison';
  appointed_at: string;
  retired_at: string | null;
  is_active: boolean;
  notes: string | null;
}

interface StaffProfile {
  user: { id: string; first_name: string; last_name: string; email: string };
}

interface StaffResponse {
  data: StaffProfile[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DlpRegisterPage() {
  const t = useTranslations('regulatory.safeguarding.dlpRegister');
  const locale = useLocale();

  const [entries, setEntries] = React.useState<DlpEntry[]>([]);
  const [staff, setStaff] = React.useState<StaffProfile[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setDialogOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: DlpEntry[] }>(
        '/api/v1/regulatory/safeguarding/dlp-register',
        { silent: true },
      );
      setEntries(res.data);
    } catch (err) {
      console.error('[DlpRegisterPage] fetch', err);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    apiClient<StaffResponse>('/api/v1/staff-profiles?page=1&pageSize=100', { silent: true })
      .then((res) => setStaff(res.data))
      .catch((err) => console.error('[DlpRegisterPage] staff fetch', err));
  }, []);

  const handleDelete = async (entry: DlpEntry) => {
    if (!window.confirm(t('confirmDelete', { name: entry.user_name }))) return;
    try {
      await apiClient(`/api/v1/regulatory/safeguarding/dlp-register/${entry.id}`, {
        method: 'DELETE',
      });
      toast.success(t('deleted'));
      void refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('deleteFailed');
      toast.error(message);
    }
  };

  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        back={{ href: `/${locale}/regulatory/safeguarding`, label: t('backToSafeguarding') }}
        actions={
          <Button className="min-h-[44px]" onClick={() => setDialogOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('addEntry')}
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
        ) : entries.length === 0 ? (
          <div className="px-4 py-8 sm:px-6">
            <EmptyState icon={UserX} title={t('emptyTitle')} description={t('emptyDescription')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.name')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.role')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.appointedAt')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.status')}</th>
                  <th className="px-4 py-2 text-end sm:px-6">{t('columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 sm:px-6">
                      <div className="font-medium text-text-primary">{e.user_name}</div>
                      <div className="font-mono text-xs text-text-tertiary">{e.user_email}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary sm:px-6">{t(`role.${e.role}`)}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary sm:px-6">
                      {new Date(e.appointed_at).toLocaleDateString(fmtLocale(locale))}
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      {e.is_active ? (
                        <StatusBadge status="success" dot>
                          {t('status.active')}
                        </StatusBadge>
                      ) : (
                        <StatusBadge status="neutral" dot>
                          {t('status.retired')}
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end sm:px-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px] min-w-[44px]"
                        onClick={() => handleDelete(e)}
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

      <DlpDialog
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        staff={staff}
        defaultAppointedAt={todayIso}
        onCreated={() => {
          setDialogOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface DlpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffProfile[];
  defaultAppointedAt: string;
  onCreated: () => void;
}

function DlpDialog({ open, onOpenChange, staff, defaultAppointedAt, onCreated }: DlpDialogProps) {
  const t = useTranslations('regulatory.safeguarding.dlpRegister');

  const form = useForm<CreateDlpEntryDto>({
    resolver: zodResolver(createDlpEntrySchema),
    defaultValues: {
      user_id: '',
      role: 'designated_liaison',
      appointed_at: defaultAppointedAt,
      retired_at: null,
      notes: '',
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        user_id: '',
        role: 'designated_liaison',
        appointed_at: defaultAppointedAt,
        retired_at: null,
        notes: '',
      });
    }
  }, [open, defaultAppointedAt, form]);

  const onSubmit = async (values: CreateDlpEntryDto) => {
    try {
      await apiClient('/api/v1/regulatory/safeguarding/dlp-register', {
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
            <Label htmlFor="role">{t('dialog.role')}</Label>
            <Controller
              name="role"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="designated_liaison">
                      {t('role.designated_liaison')}
                    </SelectItem>
                    <SelectItem value="deputy_liaison">{t('role.deputy_liaison')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="appointed_at">{t('dialog.appointedAt')}</Label>
            <Input id="appointed_at" type="date" {...form.register('appointed_at')} />
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
