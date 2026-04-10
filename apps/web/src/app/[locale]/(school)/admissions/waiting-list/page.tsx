'use client';

import { Hourglass } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { ApplicationRow } from '../_components/application-row';
import { CapacityChip } from '../_components/capacity-chip';
import { ManualPromoteDialog } from '../_components/manual-promote-dialog';
import { QueueHeader } from '../_components/queue-header';
import type { QueueYearGroupBucket } from '../_components/queue-types';
import { RejectDialog } from '../_components/reject-dialog';

interface QueueResponse {
  data: {
    waiting: QueueYearGroupBucket[];
    awaiting_year_setup: QueueYearGroupBucket[];
  };
  meta: { waiting_total: number; awaiting_year_setup_total: number };
}

export default function WaitingListPage() {
  const t = useTranslations('admissionsQueues');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [waiting, setWaiting] = React.useState<QueueYearGroupBucket[]>([]);
  const [awaitingYearSetup, setAwaitingYearSetup] = React.useState<QueueYearGroupBucket[]>([]);
  const [waitingTotal, setWaitingTotal] = React.useState(0);
  const [awaitingTotal, setAwaitingTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [rejectTargetId, setRejectTargetId] = React.useState<string | null>(null);
  const [promoteTargetId, setPromoteTargetId] = React.useState<string | null>(null);

  const fetchQueue = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<QueueResponse>('/api/v1/applications/queues/waiting-list');
      setWaiting(res.data.waiting);
      setAwaitingYearSetup(res.data.awaiting_year_setup);
      setWaitingTotal(res.meta.waiting_total);
      setAwaitingTotal(res.meta.awaiting_year_setup_total);
    } catch (err) {
      console.error('[WaitingListPage]', err);
      toast.error(t('errors.loadFailed'));
      setWaiting([]);
      setAwaitingYearSetup([]);
      setWaitingTotal(0);
      setAwaitingTotal(0);
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const totalCount = waitingTotal + awaitingTotal;

  return (
    <div className="space-y-6">
      <QueueHeader
        title={t('waitingList.title')}
        description={t('waitingList.description')}
        count={totalCount}
        countLabel={t('waitingList.countLabel')}
      />

      {loading ? (
        <div className="text-sm text-text-secondary">{t('common.loading')}</div>
      ) : totalCount === 0 ? (
        <EmptyState
          icon={Hourglass}
          title={t('waitingList.emptyTitle')}
          description={t('waitingList.emptyDescription')}
        />
      ) : (
        <div className="space-y-8">
          {waiting.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-text-primary">
                {t('waitingList.waitingSectionTitle')}
              </h2>
              {waiting.map((bucket) => {
                const atCapacity = (bucket.capacity?.available ?? 0) === 0;
                return (
                  <div
                    key={`${bucket.target_academic_year_id}:${bucket.year_group_id}`}
                    className="space-y-3"
                  >
                    <header className="flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-semibold text-text-primary">
                        {bucket.year_group_name}
                      </h3>
                      <span className="text-xs text-text-secondary">
                        {bucket.target_academic_year_name}
                      </span>
                      <CapacityChip
                        capacity={bucket.capacity}
                        yearGroupName={bucket.year_group_name}
                      />
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
                                variant="outline"
                                onClick={() => setPromoteTargetId(application.id)}
                                disabled={atCapacity}
                                title={atCapacity ? t('waitingList.atCapacityTooltip') : undefined}
                              >
                                {t('waitingList.manualPromoteButton')}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setRejectTargetId(application.id)}
                              >
                                {t('common.reject')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  router.push(`/${locale}/admissions/${application.id}`)
                                }
                              >
                                {t('common.view')}
                              </Button>
                            </>
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {awaitingYearSetup.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-text-primary">
                {t('waitingList.awaitingYearSetupSectionTitle')}
              </h2>
              <p className="text-sm text-text-secondary">
                {t('waitingList.awaitingYearSetupNote')}
              </p>
              {awaitingYearSetup.map((bucket) => (
                <div
                  key={`${bucket.target_academic_year_id}:${bucket.year_group_id}`}
                  className="space-y-3 opacity-80"
                >
                  <header className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold text-text-primary">
                      {bucket.year_group_name}
                    </h3>
                    <span className="text-xs text-text-secondary">
                      {bucket.target_academic_year_name}
                    </span>
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
                              variant="destructive"
                              onClick={() => setRejectTargetId(application.id)}
                            >
                              {t('common.reject')}
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
                </div>
              ))}
            </section>
          )}
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
      <ManualPromoteDialog
        applicationId={promoteTargetId}
        open={promoteTargetId !== null}
        onClose={() => setPromoteTargetId(null)}
        onPromoted={() => {
          setPromoteTargetId(null);
          void fetchQueue();
        }}
      />
    </div>
  );
}
