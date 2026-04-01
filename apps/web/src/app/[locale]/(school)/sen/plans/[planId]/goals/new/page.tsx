'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateSenGoalDto } from '@school/shared';
import { createSenGoalSchema } from '@school/shared';
import { Button, Input, Label, Textarea, toast } from '@school/ui';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NewGoalPage() {
  const t = useTranslations('sen');
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const planId = params?.planId as string;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateSenGoalDto>({
    resolver: zodResolver(createSenGoalSchema),
    defaultValues: {
      title: '',
      target: '',
      baseline: '',
      target_date: '',
    },
  });

  // ─── Submit ─────────────────────────────────────────────────────────────

  const onSubmit = React.useCallback(
    async (data: CreateSenGoalDto) => {
      try {
        await apiClient(`/api/v1/sen/plans/${planId}/goals`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        toast.success(t('goalForm.createSuccess'));
        router.push(`/${locale}/sen/plans/${planId}`);
      } catch (err) {
        console.error('[NewGoalPage] onSubmit', err);
        toast.error(t('goalForm.createError'));
      }
    },
    [planId, router, locale, t],
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('goalForm.title')}
        description={t('goalForm.description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/${locale}/sen/plans/${planId}`)}
          >
            <ArrowLeft className="me-1.5 h-4 w-4" />
            {t('goalForm.backToPlan')}
          </Button>
        }
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-2xl border border-border bg-surface p-6 space-y-6"
      >
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="goal-title">{t('goalForm.goalTitle')}</Label>
          <Input
            id="goal-title"
            {...register('title')}
            placeholder={t('goalForm.goalTitlePlaceholder')}
            className="w-full"
          />
          {errors.title && <p className="text-sm text-danger-text">{errors.title.message}</p>}
        </div>

        {/* Target / SMART description */}
        <div className="space-y-2">
          <Label htmlFor="goal-target">{t('goalForm.targetLabel')}</Label>
          <Textarea
            id="goal-target"
            {...register('target')}
            placeholder={t('goalForm.targetPlaceholder')}
            rows={4}
            className="resize-y"
          />
          {errors.target && <p className="text-sm text-danger-text">{errors.target.message}</p>}
        </div>

        {/* Baseline */}
        <div className="space-y-2">
          <Label htmlFor="goal-baseline">{t('goalForm.baselineLabel')}</Label>
          <Textarea
            id="goal-baseline"
            {...register('baseline')}
            placeholder={t('goalForm.baselinePlaceholder')}
            rows={4}
            className="resize-y"
          />
          {errors.baseline && <p className="text-sm text-danger-text">{errors.baseline.message}</p>}
        </div>

        {/* Target Date */}
        <div className="space-y-2">
          <Label htmlFor="goal-target-date">{t('goalForm.targetDateLabel')}</Label>
          <Input
            id="goal-target-date"
            type="date"
            {...register('target_date')}
            className="w-full sm:w-56"
          />
          {errors.target_date && (
            <p className="text-sm text-danger-text">{errors.target_date.message}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
            {t('goalForm.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/${locale}/sen/plans/${planId}`)}
            disabled={isSubmitting}
          >
            {t('goalForm.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
