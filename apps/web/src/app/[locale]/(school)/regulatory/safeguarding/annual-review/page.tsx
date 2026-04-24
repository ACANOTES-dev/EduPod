'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarCheck2, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createCpReviewSchema, type CreateCpReviewDto } from '@school/shared/regulatory';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface CpReview {
  id: string;
  academic_year: string;
  review_date: string;
  next_review_due: string;
  conducted_by_id: string | null;
  conducted_by_name: string | null;
  attendees: string | null;
  findings: string | null;
  actions_required: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'overdue';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadgeStatus(status: CpReview['status']): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'in_progress') return 'info';
  if (status === 'overdue') return 'danger';
  return 'warning';
}

function currentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnnualReviewPage() {
  const t = useTranslations('regulatory.safeguarding.annualReview');
  const locale = useLocale();

  const [reviews, setReviews] = React.useState<CpReview[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setDialogOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: CpReview[] }>(
        '/api/v1/regulatory/safeguarding/cp-reviews',
        { silent: true },
      );
      setReviews(res.data);
    } catch (err) {
      console.error('[AnnualReviewPage] fetch', err);
      setReviews([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (review: CpReview) => {
    if (!window.confirm(t('confirmDelete', { year: review.academic_year }))) return;
    try {
      await apiClient(`/api/v1/regulatory/safeguarding/cp-reviews/${review.id}`, {
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
            {t('logReview')}
          </Button>
        }
      />

      <div className="rounded-2xl border border-border bg-slate-50 px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <CalendarCheck2
            className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary"
            aria-hidden="true"
          />
          <p className="text-xs text-text-secondary leading-relaxed">{t('notice')}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-text-primary">{t('tableTitle')}</h2>
        </header>
        {isLoading ? (
          <div className="px-4 py-8 text-sm text-text-tertiary sm:px-6">{t('loading')}</div>
        ) : reviews.length === 0 ? (
          <div className="px-4 py-8 sm:px-6">
            <EmptyState
              icon={ClipboardList}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.academicYear')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.reviewDate')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.nextDue')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.conductedBy')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.status')}</th>
                  <th className="px-4 py-2 text-end sm:px-6">{t('columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-medium text-text-primary sm:px-6">
                      {r.academic_year}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary sm:px-6">
                      {new Date(r.review_date).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary sm:px-6">
                      {new Date(r.next_review_due).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary sm:px-6">
                      {r.conducted_by_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <StatusBadge status={statusBadgeStatus(r.status)}>
                        {t(`status.${r.status}`)}
                      </StatusBadge>
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

      <ReviewDialog
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function ReviewDialog({ open, onOpenChange, onCreated }: ReviewDialogProps) {
  const t = useTranslations('regulatory.safeguarding.annualReview');

  const form = useForm<CreateCpReviewDto>({
    resolver: zodResolver(createCpReviewSchema),
    defaultValues: {
      academic_year: currentAcademicYear(),
      review_date: '',
      next_review_due: '',
      conducted_by_id: null,
      attendees: '',
      findings: '',
      actions_required: '',
      status: 'completed',
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        academic_year: currentAcademicYear(),
        review_date: '',
        next_review_due: '',
        conducted_by_id: null,
        attendees: '',
        findings: '',
        actions_required: '',
        status: 'completed',
      });
    }
  }, [open, form]);

  const onSubmit = async (values: CreateCpReviewDto) => {
    try {
      await apiClient('/api/v1/regulatory/safeguarding/cp-reviews', {
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
            <Label htmlFor="academic_year">{t('dialog.academicYear')}</Label>
            <Input id="academic_year" {...form.register('academic_year')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="review_date">{t('dialog.reviewDate')}</Label>
              <Input id="review_date" type="date" {...form.register('review_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_review_due">{t('dialog.nextDue')}</Label>
              <Input id="next_review_due" type="date" {...form.register('next_review_due')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">{t('dialog.status')}</Label>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">{t('status.scheduled')}</SelectItem>
                    <SelectItem value="in_progress">{t('status.in_progress')}</SelectItem>
                    <SelectItem value="completed">{t('status.completed')}</SelectItem>
                    <SelectItem value="overdue">{t('status.overdue')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="attendees">{t('dialog.attendees')}</Label>
            <Textarea id="attendees" rows={2} {...form.register('attendees')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="findings">{t('dialog.findings')}</Label>
            <Textarea id="findings" rows={3} {...form.register('findings')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="actions_required">{t('dialog.actionsRequired')}</Label>
            <Textarea id="actions_required" rows={3} {...form.register('actions_required')} />
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
