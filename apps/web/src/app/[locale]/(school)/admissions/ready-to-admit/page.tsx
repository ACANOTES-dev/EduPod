'use client';

import { Eye } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { ApplicationRow } from '../_components/application-row';
import { CapacityChip } from '../_components/capacity-chip';
import { QueueHeader } from '../_components/queue-header';
import type { QueueYearGroupBucket } from '../_components/queue-types';
import { RejectDialog } from '../_components/reject-dialog';

interface QueueResponse {
  data: QueueYearGroupBucket[];
  meta: { total: number };
}

export default function ReadyToAdmitPage() {
  const t = useTranslations('admissionsQueues');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [buckets, setBuckets] = React.useState<QueueYearGroupBucket[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [approving, setApproving] = React.useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = React.useState<string | null>(null);

  const fetchQueue = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<QueueResponse>('/api/v1/applications/queues/ready-to-admit');
      setBuckets(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[ReadyToAdmitPage]', err);
      toast.error(t('errors.loadFailed'));
      setBuckets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const handleApprove = async (applicationId: string) => {
    setApproving(applicationId);
    try {
      await apiClient(`/api/v1/applications/${applicationId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'conditional_approval',
          expected_updated_at: new Date().toISOString(),
        }),
      });
      toast.success(t('readyToAdmit.approveSuccess'));
      void fetchQueue();
    } catch (err) {
      console.error('[ReadyToAdmitPage.approve]', err);
      toast.error(t('readyToAdmit.approveError'));
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="space-y-6">
      <QueueHeader
        title={t('readyToAdmit.title')}
        description={t('readyToAdmit.description')}
        count={total}
        countLabel={t('readyToAdmit.countLabel')}
        badges={buckets.map((bucket) => (
          <CapacityChip
            key={`${bucket.target_academic_year_id}:${bucket.year_group_id}`}
            capacity={bucket.capacity}
            yearGroupName={bucket.year_group_name}
          />
        ))}
      />

      {loading ? (
        <div className="text-sm text-text-secondary">{t('common.loading')}</div>
      ) : buckets.length === 0 ? (
        <EmptyState
          icon={Eye}
          title={t('readyToAdmit.emptyTitle')}
          description={t('readyToAdmit.emptyDescription')}
        />
      ) : (
        <div className="space-y-6">
          {buckets.map((bucket) => {
            const atCapacity = (bucket.capacity?.available ?? 0) === 0;
            return (
              <section
                key={`${bucket.target_academic_year_id}:${bucket.year_group_id}`}
                className="space-y-3"
              >
                <header className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-text-primary">
                    {bucket.year_group_name}
                  </h2>
                  <span className="text-xs text-text-secondary">
                    {bucket.target_academic_year_name}
                  </span>
                  <CapacityChip capacity={bucket.capacity} yearGroupName={bucket.year_group_name} />
                </header>
                <div className="space-y-2">
                  {bucket.applications.map((application) => (
                    <ApplicationRow
                      key={application.id}
                      application={application}
                      actions={
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(application.id)}
                            disabled={atCapacity || approving === application.id}
                            title={atCapacity ? t('readyToAdmit.atCapacityTooltip') : undefined}
                          >
                            {approving === application.id
                              ? t('common.working')
                              : t('readyToAdmit.approveButton')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRejectTargetId(application.id)}
                          >
                            {t('readyToAdmit.rejectButton')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(`/${locale}/admissions/${application.id}`)}
                          >
                            {t('common.view')}
                          </Button>
                        </>
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <RejectDialog
        applicationId={rejectTargetId}
        open={rejectTargetId !== null}
        onClose={() => setRejectTargetId(null)}
        onRejected={() => {
          setRejectTargetId(null);
          void fetchQueue();
        }}
      />
    </div>
  );
}
