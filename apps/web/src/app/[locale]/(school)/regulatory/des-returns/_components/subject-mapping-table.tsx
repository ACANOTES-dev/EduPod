'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  StatusBadge,
} from '@school/ui';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubjectMapping {
  id: string;
  subject_id: string;
  subject: { id: string; name: string } | null;
  des_code: string;
  des_name: string;
  des_level: string | null;
  is_verified: boolean;
  created_at: string;
}

interface SubjectMappingTableProps {
  data: SubjectMapping[];
  onDelete: (id: string) => void;
  isLoading: boolean;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl bg-surface-secondary p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-border" />
              <div className="h-3 w-24 rounded bg-border" />
            </div>
            <div className="h-6 w-20 rounded bg-border" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SubjectMappingTable({ data, onDelete, isLoading }: SubjectMappingTableProps) {
  const t = useTranslations('regulatory');
  const [deleteTarget, setDeleteTarget] = React.useState<SubjectMapping | null>(null);

  function handleConfirmDelete() {
    if (deleteTarget) {
      onDelete(deleteTarget.id);
      setDeleteTarget(null);
    }
  }

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
        <p className="text-sm text-text-tertiary">{t('desReturns.noMappings')}</p>
      </div>
    );
  }

  return (
    <>
      {/* ─── Mobile cards ───────────────────────────────────────────────── */}
      <div className="space-y-3 md:hidden">
        {data.map((row) => (
          <div key={row.id} className="rounded-2xl border border-border bg-surface px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-text-primary">
                {row.subject?.name ?? row.subject_id}
              </p>
              <StatusBadge status={row.is_verified ? 'success' : 'neutral'} dot>
                {row.is_verified ? t('desReturns.verified') : t('desReturns.unverified')}
              </StatusBadge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
              <span>
                {t('desReturns.codeLabel')}: {row.des_code}
              </span>
              <span>{row.des_name}</span>
              {row.des_level && <span>{row.des_level}</span>}
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(row)}
                className="text-danger-text hover:bg-danger-fill"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Desktop table ──────────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-tertiary">
              <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                {t('desReturns.subjectName')}
              </th>
              <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                {t('desReturns.desCode')}
              </th>
              <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                {t('desReturns.desName')}
              </th>
              <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                {t('desReturns.level')}
              </th>
              <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                {t('desReturns.verifiedCol')}
              </th>
              <th className="px-3 py-3 text-end text-xs font-medium uppercase tracking-wider">
                {t('desReturns.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-surface-secondary">
                <td className="px-3 py-3 font-medium text-text-primary">
                  {row.subject?.name ?? row.subject_id}
                </td>
                <td className="px-3 py-3 tabular-nums text-text-secondary">{row.des_code}</td>
                <td className="px-3 py-3 text-text-secondary">{row.des_name}</td>
                <td className="px-3 py-3 text-text-secondary">{row.des_level ?? '—'}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={row.is_verified ? 'success' : 'neutral'} dot>
                    {row.is_verified ? t('desReturns.verified') : t('desReturns.unverified')}
                  </StatusBadge>
                </td>
                <td className="px-3 py-3 text-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(row)}
                    className="text-danger-text hover:bg-danger-fill"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Delete Confirmation Dialog ─────────────────────────────────── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('desReturns.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('desReturns.deleteDescription', {
                name: deleteTarget?.des_name ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('desReturns.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              {t('desReturns.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
