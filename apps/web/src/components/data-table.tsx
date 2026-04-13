'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, TableWrapper } from '@school/ui';

interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  toolbar?: React.ReactNode;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string;
  isLoading?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  toolbar,
  page,
  pageSize,
  total,
  onPageChange,
  onRowClick,
  keyExtractor,
  isLoading,
}: DataTableProps<T>) {
  const t = useTranslations('common');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <TableWrapper
      toolbar={toolbar}
      pagination={
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>{total === 0 ? 'No results' : `Showing ${startItem}–${endItem} of ${total}`}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label={t('previousPage')}
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <span className="px-2 text-sm text-text-primary">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label={t('nextPage')}
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      }
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`skeleton-${i}`} className="border-b border-border last:border-b-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-surface-secondary" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-text-tertiary"
              >
                {t('noResults')}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className={`border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm text-text-primary ${col.className ?? ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableWrapper>
  );
}
