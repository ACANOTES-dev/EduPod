'use client';

import { Copy, Loader2, Plus, Search, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { AudienceDefinition } from '@school/shared/inbox';
import {
  Badge,
  Button,
  Drawer,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  toast,
} from '@school/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { apiClient, unwrap } from '@/lib/api-client';
import { useIsAdmin } from '@/lib/use-is-admin';

import { AudiencePreview } from './_components/audience-preview';
import {
  isDynamicDefinition,
  isStaticDefinition,
  type SavedAudienceRow,
} from './_components/types';

type KindFilter = 'all' | 'static' | 'dynamic';

interface SavedAudienceListResponse {
  data: SavedAudienceRow[];
}

export default function SavedAudiencesPage() {
  const t = useTranslations('inbox.audiences');
  const router = useRouter();
  const locale = useLocale();
  const isAdmin = useIsAdmin();

  // Saved audiences are an admin-tier feature. Teachers still compose
  // to their own classes via the inline audience picker in the Compose
  // dialog — they just don't get the saved-audience management page.
  React.useEffect(() => {
    if (isAdmin === false) {
      router.replace(`/${locale}/inbox`);
    }
  }, [isAdmin, router, locale]);

  const [rows, setRows] = React.useState<SavedAudienceRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [kindFilter, setKindFilter] = React.useState<KindFilter>('all');
  const [selectedRow, setSelectedRow] = React.useState<SavedAudienceRow | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null);

  const fetchAudiences = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (kindFilter !== 'all') params.set('kind', kindFilter);
      const res = await apiClient<SavedAudienceListResponse>(
        `/api/v1/inbox/audiences${params.toString() ? '?' + params.toString() : ''}`,
      );
      setRows(unwrap<SavedAudienceListResponse>(res).data ?? []);
    } catch (err) {
      console.error('[SavedAudiencesPage.fetch]', err);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [kindFilter]);

  React.useEffect(() => {
    void fetchAudiences();
  }, [fetchAudiences]);

  const filteredRows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const hay = [row.name, row.description ?? ''].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, search]);

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await apiClient<void>(`/api/v1/inbox/audiences/${deletingId}`, {
        method: 'DELETE',
      });
      toast.success(t('toast.deleted'));
      setRows((prev) => prev.filter((r) => r.id !== deletingId));
      if (selectedRow?.id === deletingId) setSelectedRow(null);
    } catch (err) {
      console.error('[SavedAudiencesPage.delete]', err);
      toast.error(t('toast.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (row: SavedAudienceRow) => {
    setDuplicatingId(row.id);
    try {
      const suffix = ` (${t('duplicateSuffix')})`;
      const payload = {
        name: `${row.name}${suffix}`.slice(0, 255),
        description: row.description,
        kind: row.kind,
        definition: row.definition_json as AudienceDefinition | { user_ids: string[] },
      };
      const res = await apiClient<SavedAudienceRow | { data: SavedAudienceRow }>(
        '/api/v1/inbox/audiences',
        { method: 'POST', body: JSON.stringify(payload) },
      );
      const created = unwrap<SavedAudienceRow>(res);
      toast.success(t('toast.duplicated'));
      setRows((prev) => [created, ...prev]);
    } catch (err) {
      console.error('[SavedAudiencesPage.duplicate]', err);
      const code = (err as { error?: { code?: string } })?.error?.code;
      if (code === 'SAVED_AUDIENCE_NAME_TAKEN') {
        toast.error(t('errors.duplicateNameTaken'));
      } else {
        toast.error(t('toast.duplicateFailed'));
      }
    } finally {
      setDuplicatingId(null);
    }
  };

  if (isAdmin !== true) {
    return <div className="h-[50vh]" aria-hidden="true" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => router.push('/inbox/audiences/new')}>
            <Plus className="me-2 h-4 w-4" />
            {t('new')}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-9 bg-surface-secondary ps-9"
            aria-label={t('searchPlaceholder')}
          />
        </div>

        <div className="flex items-center gap-1 rounded-pill border border-border bg-surface-secondary p-0.5">
          {(['all', 'static', 'dynamic'] as KindFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setKindFilter(key)}
              className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
                kindFilter === key
                  ? 'bg-background text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t(`filters.${key}`)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-border p-12 text-sm text-text-secondary">
          <Loader2 className="me-2 h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('empty.title')}
          description={search ? t('empty.searchDescription') : t('empty.description')}
          action={
            !search
              ? {
                  label: t('new'),
                  onClick: () => router.push('/inbox/audiences/new'),
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-tertiary">
              <tr>
                <th className="px-5 py-3 text-start font-semibold">{t('columns.name')}</th>
                <th className="hidden px-5 py-3 text-start font-semibold md:table-cell">
                  {t('columns.description')}
                </th>
                <th className="px-5 py-3 text-start font-semibold">{t('columns.kind')}</th>
                <th className="hidden px-5 py-3 text-start font-semibold sm:table-cell">
                  {t('columns.members')}
                </th>
                <th className="px-5 py-3 text-end font-semibold">{t('columns.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => (
                <AudienceRow
                  key={row.id}
                  row={row}
                  onPreview={() => setSelectedRow(row)}
                  onOpen={() => router.push(`/inbox/audiences/${row.id}`)}
                  onDuplicate={() => handleDuplicate(row)}
                  onDelete={() => setDeletingId(row.id)}
                  duplicatingId={duplicatingId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={!!selectedRow}
        onOpenChange={(open) => !open && setSelectedRow(null)}
        title={selectedRow?.name ?? ''}
        description={selectedRow?.description ?? undefined}
      >
        {selectedRow && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={selectedRow.kind === 'dynamic' ? 'info' : 'secondary'}>
                {t(`kind.${selectedRow.kind}`)}
              </Badge>
              <span className="text-xs text-text-secondary">
                {new Date(selectedRow.updated_at).toLocaleDateString()}
              </span>
            </div>

            {selectedRow.kind === 'static' && isStaticDefinition(selectedRow.definition_json) ? (
              <AudiencePreview staticUserIds={selectedRow.definition_json.user_ids} />
            ) : isDynamicDefinition(selectedRow.definition_json) ? (
              <AudiencePreview definition={selectedRow.definition_json} />
            ) : null}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push(`/inbox/audiences/${selectedRow.id}`)}
              >
                {t('drawer.openFull')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void handleDuplicate(selectedRow);
                }}
                disabled={duplicatingId === selectedRow.id}
              >
                <Copy className="me-2 h-4 w-4" />
                {t('actions.duplicate')}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title={t('delete.confirm.title')}
        description={t('delete.confirm.body')}
        confirmLabel={t('actions.delete')}
        cancelLabel={t('actions.cancel')}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

interface AudienceRowProps {
  row: SavedAudienceRow;
  onPreview: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicatingId: string | null;
}

function AudienceRow({
  row,
  onPreview,
  onOpen,
  onDuplicate,
  onDelete,
  duplicatingId,
}: AudienceRowProps) {
  const t = useTranslations('inbox.audiences');

  const memberLabel = React.useMemo(() => {
    if (row.kind === 'static' && isStaticDefinition(row.definition_json)) {
      return t('memberCount', { count: row.definition_json.user_ids.length });
    }
    return t('memberCountDynamic');
  }, [row, t]);

  return (
    <tr className="transition-colors hover:bg-surface-secondary/60">
      <td className="px-5 py-3.5">
        <button
          type="button"
          onClick={onPreview}
          className="text-start font-semibold text-text-primary transition-colors hover:text-primary-600"
        >
          {row.name}
        </button>
      </td>
      <td className="hidden px-5 py-3.5 text-text-secondary md:table-cell">
        <span className="line-clamp-1 max-w-sm text-[13px]">{row.description ?? '—'}</span>
      </td>
      <td className="px-5 py-3.5">
        <Badge variant={row.kind === 'dynamic' ? 'info' : 'secondary'}>
          {t(`kind.${row.kind}`)}
        </Badge>
      </td>
      <td className="hidden px-5 py-3.5 text-[13px] text-text-secondary sm:table-cell">
        {memberLabel}
      </td>
      <td className="px-5 py-3.5 text-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={t('actions.menu')}>
              …
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>{t('actions.view')}</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate} disabled={duplicatingId === row.id}>
              <Copy className="me-2 h-4 w-4" />
              {t('actions.duplicate')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-danger-text">
              <Trash2 className="me-2 h-4 w-4" />
              {t('actions.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
