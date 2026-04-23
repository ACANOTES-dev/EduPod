'use client';

import { Plus, Settings, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { TuslaMappingsDialog } from '../_components/tusla-mappings-dialog';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TuslaMappingRow {
  id: string;
  attendance_status: string;
  reason_pattern: string | null;
  tusla_category: string;
  display_label: string;
  is_default: boolean;
  created_at: string;
}

// ─── Display helpers ────────────────────────────────────────────────────────

const CATEGORY_LABEL_KEY: Record<string, string> = {
  illness: 'illness',
  urgent_family_reason: 'urgent_family_reason',
  holiday: 'holiday',
  tusla_suspension: 'suspension',
  tusla_expulsion: 'expulsion',
  tusla_other: 'other',
  unexplained: 'unexplained',
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TuslaMappingsPage() {
  const t = useTranslations('regulatory.tusla');
  const locale = useLocale();

  const [rows, setRows] = React.useState<TuslaMappingRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<TuslaMappingRow[] | { data: TuslaMappingRow[] }>(
        '/api/v1/regulatory/tusla/absence-mappings',
      );
      // ResponseTransformInterceptor may wrap non-paginated arrays in { data: [...] }
      setRows(Array.isArray(res) ? res : (res.data ?? []));
    } catch (err) {
      console.error('[TuslaMappingsPage] fetch failed', err);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('mappingsConfirmDelete'))) return;
    setDeletingId(id);
    try {
      await apiClient(`/api/v1/regulatory/tusla/absence-mappings/${id}`, { method: 'DELETE' });
      await fetchData();
    } catch (err) {
      console.error('[TuslaMappingsPage] delete failed', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('mappingsTitle')}
        description={t('mappingsDescription')}
        back={{ href: `/${locale}/regulatory/tusla`, label: t('backToTusla') }}
        actions={
          <Button onClick={() => setDialogOpen(true)} className="min-h-[44px]">
            <Plus className="me-2 h-4 w-4" />
            {t('mappingsAdd')}
          </Button>
        }
      />

      <section className="rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between px-5 py-3 text-sm text-text-secondary">
          <span>{t('mappingsCount', { count: rows.length })}</span>
        </header>

        {isLoading ? (
          <ul className="divide-y divide-border/50">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="animate-pulse px-5 py-4">
                <div className="h-4 w-2/3 rounded bg-border/60" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Settings}
            title={t('mappingsEmptyTitle')}
            description={t('mappingsEmptyDescription')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-border/70 bg-surface-secondary/40">
                <tr className="text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  <th className="px-5 py-3 text-start">{t('mappingsColAttendanceStatus')}</th>
                  <th className="px-5 py-3 text-start">{t('mappingsColTuslaCategory')}</th>
                  <th className="px-5 py-3 text-start">{t('mappingsColDisplayLabel')}</th>
                  <th className="px-5 py-3 text-start">{t('mappingsColDefault')}</th>
                  <th className="px-5 py-3 text-end">{t('mappingsColActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((row) => {
                  const categoryKey = CATEGORY_LABEL_KEY[row.tusla_category] ?? row.tusla_category;
                  return (
                    <tr key={row.id} className="text-sm">
                      <td className="px-5 py-3">
                        {t(`mappingsAttendanceStatusOptions.${row.attendance_status}`)}
                      </td>
                      <td className="px-5 py-3">
                        {t(`mappingsTuslaCategoryOptions.${categoryKey}`)}
                      </td>
                      <td className="px-5 py-3 font-medium text-text-primary">
                        {row.display_label}
                      </td>
                      <td className="px-5 py-3">
                        {row.is_default ? (
                          <Badge variant="success">{t('mappingsYes')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('mappingsNo')}</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-[36px] text-danger-text hover:bg-danger-fill"
                          disabled={deletingId === row.id}
                          onClick={() => void handleDelete(row.id)}
                          aria-label={t('mappingsDelete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('mappingsCreateTitle')}</DialogTitle>
            <DialogDescription>{t('mappingsCreateDescription')}</DialogDescription>
          </DialogHeader>
          <TuslaMappingsDialog
            onSuccess={() => {
              setDialogOpen(false);
              void fetchData();
            }}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
