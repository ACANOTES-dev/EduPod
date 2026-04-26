'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Skeleton } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import type { ScenarioSummary, ModelSummary } from '../_components/workspace-types';
import type { SnapshotSummary } from '../snapshots/_components/snapshot-types';

import { IssueLinkModal } from './_components/issue-link-modal';
import { LinkRow } from './_components/link-row';
import { RevokeConfirmModal } from './_components/revoke-confirm-modal';
import { deriveLifecycle, type ShareableLinkRow } from './_components/share-types';

interface Props {
  params: { locale: string; id: string };
}

interface ModelDetail {
  model: ModelSummary;
  scenarios: ScenarioSummary[];
}

interface PaginatedSnapshots {
  data: SnapshotSummary[];
  meta: { page: number; pageSize: number; total: number };
}

export default function ShareLinksPage({ params }: Props) {
  const t = useTranslations('financeBudgetingShare');
  const locale = params.locale ?? 'en';
  const modelId = params.id;

  const [model, setModel] = React.useState<ModelSummary | null>(null);
  const [scenarios, setScenarios] = React.useState<ScenarioSummary[]>([]);
  const [snapshots, setSnapshots] = React.useState<SnapshotSummary[]>([]);
  const [linksBySnapshot, setLinksBySnapshot] = React.useState<Record<string, ShareableLinkRow[]>>(
    {},
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [issueOpen, setIssueOpen] = React.useState<boolean>(false);
  const [revokeTarget, setRevokeTarget] = React.useState<{
    snapshotId: string;
    linkId: string;
    tokenSuffix: string;
  } | null>(null);
  const [showInactive, setShowInactive] = React.useState<boolean>(false);

  const reload = React.useCallback(async (): Promise<void> => {
    try {
      const [modelRes, snapsRes] = await Promise.all([
        apiClient<ModelDetail>(`/api/v1/budgeting/financial-models/${modelId}`),
        apiClient<PaginatedSnapshots>(
          `/api/v1/budgeting/financial-models/${modelId}/snapshots?pageSize=100`,
        ),
      ]);
      setModel(modelRes.model);
      setScenarios(modelRes.scenarios ?? []);
      setSnapshots(snapsRes.data ?? []);

      // Fetch the link list for every snapshot in parallel.
      const linkResults = await Promise.all(
        (snapsRes.data ?? []).map((s) =>
          apiClient<{ data: ShareableLinkRow[] }>(
            `/api/v1/budgeting/financial-models/${modelId}/snapshots/${s.id}/links`,
            { silent: true },
          ).then(
            (res) => ({ snapshotId: s.id, rows: res.data ?? [] }),
            (err) => {
              console.error('[ShareLinksPage.links]', s.id, err);
              return { snapshotId: s.id, rows: [] as ShareableLinkRow[] };
            },
          ),
        ),
      );

      const next: Record<string, ShareableLinkRow[]> = {};
      for (const r of linkResults) next[r.snapshotId] = r.rows;
      setLinksBySnapshot(next);
    } catch (err) {
      console.error('[ShareLinksPage.load]', err);
      setError(err instanceof Error ? err.message : t('loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [modelId, t]);

  React.useEffect(() => {
    setIsLoading(true);
    void reload();
  }, [reload]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error ?? t('loadError')}
        </div>
      </div>
    );
  }

  const allLinks = Object.values(linksBySnapshot).flat();
  const activeLinks = allLinks.filter((l) => deriveLifecycle(l) === 'active');
  const inactiveLinks = allLinks.filter((l) => deriveLifecycle(l) !== 'active');

  // Latest published snapshot — used as the default in the issue modal.
  const latestSnapshot =
    snapshots.length > 0
      ? snapshots.reduce(
          (max, s) => (s.version_number > max.version_number ? s : max),
          snapshots[0]!,
        )
      : null;

  const scenarioOptions = [
    { key: 'base', label: t('modal.scenarios.baseLabel'), isBase: true },
    ...scenarios.map((s) => ({ key: s.name, label: s.name, isBase: false })),
  ];

  const onRevokeClick = (linkId: string): void => {
    const link = allLinks.find((l) => l.id === linkId);
    if (!link) return;
    // Find the snapshot this link belongs to.
    const snapshotEntry = Object.entries(linksBySnapshot).find(([, rows]) =>
      rows.some((r) => r.id === linkId),
    );
    if (!snapshotEntry) return;
    setRevokeTarget({
      snapshotId: snapshotEntry[0],
      linkId,
      tokenSuffix: link.token.slice(-8),
    });
  };

  const canIssue = latestSnapshot !== null;

  return (
    <div className="flex min-w-0 flex-col gap-6 p-6 pb-10">
      <PageHeader
        title={t('manage.title')}
        description={t('manage.subtitle', { name: model.name })}
        back={{
          href: `/${locale}/finance/budgeting/models/${modelId}/snapshots`,
          label: t('manage.backToSnapshots'),
        }}
        actions={
          canIssue && <Button onClick={() => setIssueOpen(true)}>{t('manage.issueLink')}</Button>
        }
      />

      {!canIssue && (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('manage.noSnapshots.title')}
          </h2>
          <p className="mt-2 max-w-md text-sm text-text-secondary mx-auto">
            {t('manage.noSnapshots.body')}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/${locale}/finance/budgeting/models/${modelId}`}>
              {t('manage.noSnapshots.cta')}
            </Link>
          </Button>
        </div>
      )}

      {canIssue && allLinks.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
          <h2 className="text-lg font-semibold text-text-primary">{t('manage.empty.title')}</h2>
          <p className="mt-2 max-w-md text-sm text-text-secondary mx-auto">
            {t('manage.empty.body')}
          </p>
          <Button onClick={() => setIssueOpen(true)} className="mt-4">
            {t('manage.empty.cta')}
          </Button>
        </div>
      )}

      {activeLinks.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-primary">
            {t('manage.activeHeading', { count: activeLinks.length })}
          </h2>
          <ul className="flex flex-col gap-3">
            {activeLinks.map((l) => (
              <li key={l.id}>
                <LinkRow link={l} canRevoke onRevokeClick={onRevokeClick} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {inactiveLinks.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowInactive((s) => !s)}
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary"
            aria-expanded={showInactive}
          >
            <span>{t('manage.inactiveHeading', { count: inactiveLinks.length })}</span>
            <span aria-hidden="true">{showInactive ? '−' : '+'}</span>
          </button>
          {showInactive && (
            <ul className="flex flex-col gap-3">
              {inactiveLinks.map((l) => (
                <li key={l.id}>
                  <LinkRow link={l} canRevoke={false} onRevokeClick={onRevokeClick} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {latestSnapshot && (
        <IssueLinkModal
          open={issueOpen}
          modelId={modelId}
          snapshotId={latestSnapshot.id}
          snapshotVersion={latestSnapshot.version_number}
          scenarios={scenarioOptions}
          onClose={() => setIssueOpen(false)}
          onCreated={() => {
            void reload();
          }}
        />
      )}

      <RevokeConfirmModal
        open={revokeTarget !== null}
        modelId={modelId}
        snapshotId={revokeTarget?.snapshotId ?? null}
        linkId={revokeTarget?.linkId ?? null}
        tokenSuffix={revokeTarget?.tokenSuffix ?? null}
        onClose={() => setRevokeTarget(null)}
        onRevoked={() => {
          void reload();
        }}
      />
    </div>
  );
}
