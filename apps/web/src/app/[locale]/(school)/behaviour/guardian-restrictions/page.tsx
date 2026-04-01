'use client';

import { Ban, Plus, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';


import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CreateRestrictionSheet } from './_components/create-restriction-sheet';
import { StatusBadge, TypeBadge } from './_components/restriction-badges';
import { RestrictionDetailSheet } from './_components/restriction-detail-sheet';
import {
  RESTRICTION_TYPE_LABELS,
  RESTRICTION_TYPES,
  getParentDisplayName,
} from './_components/restriction-types';
import type { RestrictionRow, RestrictionsResponse } from './_components/restriction-types';
import { RevokeRestrictionSheet } from './_components/revoke-restriction-sheet';


// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GuardianRestrictionsPage() {
  const t = useTranslations('behaviour.guardianRestrictions');

  // ─── List State ───────────────────────────────────────────────────────────────
  const [data, setData] = React.useState<RestrictionRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');

  const isMobile = useIsMobile();

  // ─── Sheet state ─────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailData, setDetailData] = React.useState<RestrictionRow | null>(null);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [revokeId, setRevokeId] = React.useState<string | null>(null);

  // ─── Fetch Restrictions ───────────────────────────────────────────────────────

  const fetchRestrictions = React.useCallback(async (p: number, status: string, type: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (status !== 'all') params.set('status', status);
      const res = await apiClient<RestrictionsResponse>(
        `/api/v1/behaviour/guardian-restrictions?${params.toString()}`,
      );
      // Client-side type filter (the API doesn't support type filter directly)
      let items = res.data ?? [];
      if (type !== 'all') {
        items = items.filter((r) => r.restriction_type === type);
      }
      setData(items);
      setTotal(type !== 'all' ? items.length : (res.meta?.total ?? 0));
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchRestrictions(page, statusFilter, typeFilter);
  }, [page, statusFilter, typeFilter, fetchRestrictions]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await apiClient<RestrictionRow>(`/api/v1/behaviour/guardian-restrictions/${id}`);
      setDetailData(res);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function openRevoke(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setRevokeId(id);
    setRevokeOpen(true);
  }

  function handleRevoked() {
    void fetchRestrictions(page, statusFilter, typeFilter);
    // Refresh detail sheet if it was showing the revoked restriction
    if (detailOpen && detailData?.id === revokeId) {
      void openDetail(revokeId ?? '');
    }
  }

  // ─── DataTable Columns ────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'student',
      header: 'Student',
      render: (row: RestrictionRow) => (
        <span className="text-sm font-medium text-text-primary">
          {row.student ? `${row.student.first_name} ${row.student.last_name}` : '\u2014'}
        </span>
      ),
    },
    {
      key: 'parent',
      header: 'Guardian',
      render: (row: RestrictionRow) => (
        <span className="text-sm text-text-primary">{getParentDisplayName(row.parent)}</span>
      ),
    },
    {
      key: 'restriction_type',
      header: 'Type',
      render: (row: RestrictionRow) => <TypeBadge type={row.restriction_type} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: RestrictionRow) => <StatusBadge status={row.status} />,
    },
    {
      key: 'effective_from',
      header: 'Effective From',
      render: (row: RestrictionRow) => (
        <span className="font-mono text-xs text-text-primary">
          {formatDate(row.effective_from)}
        </span>
      ),
    },
    {
      key: 'effective_until',
      header: 'Effective Until',
      render: (row: RestrictionRow) => (
        <span className="font-mono text-xs text-text-primary">
          {row.effective_until ? formatDate(row.effective_until) : 'Indefinite'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: RestrictionRow) => {
        const isActive = row.status === 'active_restriction' || row.status === 'active';
        return isActive ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => openRevoke(row.id, e)}
            className="shrink-0 text-red-600 hover:text-red-700"
          >
            <Ban className="me-1 h-3.5 w-3.5" />
            Revoke
          </Button>
        ) : null;
      },
    },
  ];

  // ─── Toolbar ─────────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={typeFilter}
        onValueChange={(v) => {
          setTypeFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-52">
          <SelectValue placeholder="Restriction Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {RESTRICTION_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {RESTRICTION_TYPE_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="expired">Expired</SelectItem>
          <SelectItem value="revoked">Revoked</SelectItem>
          <SelectItem value="superseded">Superseded</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Mobile Card ──────────────────────────────────────────────────────────────

  const renderMobileCard = (row: RestrictionRow) => {
    const isActive = row.status === 'active_restriction' || row.status === 'active';
    const accentBorder = isActive
      ? 'border-s-red-500'
      : row.status === 'revoked'
        ? 'border-s-amber-500'
        : 'border-s-gray-400';

    return (
      <button
        key={row.id}
        type="button"
        onClick={() => void openDetail(row.id)}
        className={`w-full rounded-xl border border-border border-s-4 ${accentBorder} bg-surface p-4 text-start transition-colors hover:bg-surface-secondary dark:bg-surface dark:hover:bg-surface-secondary`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {row.student
                ? `${row.student.first_name} ${row.student.last_name}`
                : t('unknownStudent')}
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              Guardian: {getParentDisplayName(row.parent)}
            </p>
          </div>
          <StatusBadge status={row.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypeBadge type={row.restriction_type} />
          <span className="text-xs text-text-tertiary">
            {formatDate(row.effective_from)}
            {row.effective_until
              ? ` \u2013 ${formatDate(row.effective_until)}`
              : ' \u2013 Indefinite'}
          </span>
        </div>
        {isActive && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-red-600 hover:text-red-700"
              onClick={(e) => openRevoke(row.id, e)}
            >
              <Ban className="me-1 h-3.5 w-3.5" />
              Revoke
            </Button>
          </div>
        )}
      </button>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-1.5 h-4 w-4" />
            {t('addRestriction')}
          </Button>
        }
      />

      {/* List View */}
      {isMobile ? (
        <div>
          {toolbar}
          <div className="mt-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-secondary" />
              ))
            ) : data.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface py-12 text-center dark:bg-surface">
                <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-text-tertiary" />
                <p className="text-sm font-medium text-text-primary">No restrictions found</p>
                <p className="mt-1 text-xs text-text-tertiary">
                  No guardian restrictions match the current filters
                </p>
              </div>
            ) : (
              data.map(renderMobileCard)
            )}
          </div>
          {/* Mobile pagination */}
          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>
                Page {page} of {Math.ceil(total / PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => void openDetail(row.id)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* Sheets */}
      <CreateRestrictionSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void fetchRestrictions(page, statusFilter, typeFilter)}
      />

      <RestrictionDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        loading={detailLoading}
        data={detailData}
        onRevokeClick={(id) => openRevoke(id)}
      />

      <RevokeRestrictionSheet
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        revokeId={revokeId}
        onRevoked={handleRevoked}
      />
    </div>
  );
}
