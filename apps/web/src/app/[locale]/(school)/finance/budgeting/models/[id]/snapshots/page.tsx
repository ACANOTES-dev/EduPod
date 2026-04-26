'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Skeleton, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { useTenantCurrency } from '../../../../_components/use-tenant-currency';
import type { ModelSummary } from '../_components/workspace-types';

import { PublishModal } from './_components/publish-modal';
import { RestoreConfirmModal } from './_components/restore-confirm-modal';
import { SnapshotDetailDrawer } from './_components/snapshot-detail-drawer';
import { SnapshotRow } from './_components/snapshot-row';
import type { SnapshotSummary } from './_components/snapshot-types';

const POLL_MS = 10_000;
const POLL_CAP_MS = 5 * 60 * 1000;

interface Props {
  params: { locale: string; id: string };
}

interface ModelDetail {
  model: ModelSummary;
}

interface PaginatedSnapshots {
  data: SnapshotSummary[];
  meta: { page: number; pageSize: number; total: number };
}

export default function SnapshotsPage({ params }: Props) {
  const t = useTranslations('financeBudgetingSnapshots');
  const router = useRouter();
  const currencyCode = useTenantCurrency();
  const locale = params.locale ?? 'en';
  const modelId = params.id;

  const [model, setModel] = React.useState<ModelSummary | null>(null);
  const [snapshots, setSnapshots] = React.useState<SnapshotSummary[] | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [drawerSnapshotId, setDrawerSnapshotId] = React.useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = React.useState<{ id: string; version: number } | null>(
    null,
  );
  const [publishOpen, setPublishOpen] = React.useState<boolean>(false);
  const pollStartedAtRef = React.useRef<number | null>(null);

  const reload = React.useCallback(async (): Promise<void> => {
    try {
      const [modelRes, snapsRes] = await Promise.all([
        apiClient<{ data: ModelDetail } | ModelDetail>(
          `/api/v1/budgeting/financial-models/${modelId}`,
        ),
        apiClient<PaginatedSnapshots>(
          `/api/v1/budgeting/financial-models/${modelId}/snapshots?pageSize=100`,
        ),
      ]);
      const detail = 'model' in modelRes ? modelRes : (modelRes as { data: ModelDetail }).data;
      setModel(detail.model);
      setSnapshots(snapsRes.data);
    } catch (err) {
      console.error('[Snapshots.load]', err);
      setError(err instanceof Error ? err.message : t('loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [modelId, t]);

  React.useEffect(() => {
    setIsLoading(true);
    void reload();
  }, [reload]);

  // Polling for render status — only when at least one row is pending.
  React.useEffect(() => {
    if (!snapshots) return;
    const hasPending = snapshots.some(
      (s) => s.pdf_object_key === null || s.excel_object_key === null,
    );
    if (!hasPending) {
      pollStartedAtRef.current = null;
      return;
    }
    if (pollStartedAtRef.current === null) pollStartedAtRef.current = Date.now();

    const id = window.setInterval(async () => {
      if (
        pollStartedAtRef.current !== null &&
        Date.now() - pollStartedAtRef.current > POLL_CAP_MS
      ) {
        window.clearInterval(id);
        return;
      }
      try {
        const res = await apiClient<PaginatedSnapshots>(
          `/api/v1/budgeting/financial-models/${modelId}/snapshots?pageSize=100`,
        );
        setSnapshots(res.data);
      } catch (err) {
        console.error('[Snapshots.poll]', err);
      }
    }, POLL_MS);

    return () => {
      window.clearInterval(id);
    };
  }, [snapshots, modelId]);

  if (isLoading || !model || !snapshots) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  // Latest by version_number (we sort desc on the server side).
  const latestId =
    snapshots.length > 0
      ? snapshots.reduce(
          (max, s) => (s.version_number > max.version_number ? s : max),
          snapshots[0]!,
        ).id
      : null;

  const canPublish = model.status === 'draft';

  return (
    <div className="flex min-w-0 flex-col gap-4 p-6 pb-10">
      <PageHeader
        title={t('title')}
        description={model.name}
        back={{
          href: `/${locale}/finance/budgeting/models/${modelId}`,
          label: t('backToWorkspace'),
        }}
        actions={
          canPublish && <Button onClick={() => setPublishOpen(true)}>{t('publishCta')}</Button>
        }
      />

      {snapshots.length === 0 ? (
        <div className="flex min-w-0 flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
          <h2 className="text-lg font-semibold text-text-primary">{t('empty.title')}</h2>
          <p className="max-w-md text-sm text-text-secondary">{t('empty.body')}</p>
          <Button asChild variant="outline">
            <Link href={`/${locale}/finance/budgeting/models/${modelId}`}>{t('empty.cta')}</Link>
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {snapshots.map((s) => (
            <SnapshotRow
              key={s.id}
              snapshot={s}
              isCurrent={s.id === latestId}
              modelId={modelId}
              locale={locale}
              canPublish={canPublish}
              canShare
              onView={() => setDrawerSnapshotId(s.id)}
              onRestoreClick={() => setRestoreTarget({ id: s.id, version: s.version_number })}
              onRetryRender={() => {
                void apiClient(
                  `/api/v1/budgeting/financial-models/${modelId}/snapshots/${s.id}/exports/regenerate`,
                  { method: 'POST' },
                ).then(
                  () => {
                    toast.success(t('retryEnqueued'));
                    void reload();
                  },
                  (err) => {
                    console.error('[Snapshots.retry]', err);
                    toast.error(t('retryFailed'));
                  },
                );
              }}
            />
          ))}
        </ul>
      )}

      <SnapshotDetailDrawer
        open={drawerSnapshotId !== null}
        modelId={modelId}
        snapshotId={drawerSnapshotId}
        currencyCode={currencyCode}
        locale={locale}
        onClose={() => setDrawerSnapshotId(null)}
      />

      <PublishModal
        open={publishOpen}
        modelId={modelId}
        modelName={model.name}
        onClose={() => setPublishOpen(false)}
        onPublished={(_id, versionNumber) => {
          toast.success(t('publishModal.publishedToast', { version: versionNumber }));
          void reload();
        }}
      />

      <RestoreConfirmModal
        open={restoreTarget !== null}
        modelId={modelId}
        snapshotId={restoreTarget?.id ?? null}
        versionNumber={restoreTarget?.version ?? null}
        onClose={() => setRestoreTarget(null)}
        onRestored={(version) => {
          toast.success(t('restoreModal.restoredToast', { n: version }));
          router.push(`/${locale}/finance/budgeting/models/${modelId}`);
        }}
      />
    </div>
  );
}
