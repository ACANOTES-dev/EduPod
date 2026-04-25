'use client';

import { Copy, MoreHorizontal, Search, Share2, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@school/ui';

export interface SavedReportListItem {
  id: string;
  name: string;
  data_source: string;
  is_shared: boolean;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

interface SavedReportsSidebarProps {
  currentUserId: string | null;
  reports: SavedReportListItem[];
  loading: boolean;
  currentReportId: string | null;
  onSelect: (reportId: string) => void;
  onDelete: (report: SavedReportListItem) => void;
  onDuplicate?: (report: SavedReportListItem) => void;
  onShare?: (report: SavedReportListItem) => void;
}

export function SavedReportsSidebar({
  currentUserId, reports, loading, currentReportId, onSelect, onDelete, onDuplicate, onShare,
}: SavedReportsSidebarProps) {
  const t = useTranslations('reports.builder.sidebar');
  const [searchQuery, setSearchQuery] = React.useState('');
  const filtered = React.useMemo(() => {
    if (searchQuery === '') return reports;
    const needle = searchQuery.toLowerCase();
    return reports.filter((r) => r.name.toLowerCase().includes(needle));
  }, [reports, searchQuery]);
  const own = filtered.filter((r) => r.created_by_user_id === currentUserId);
  const shared = filtered.filter((r) => r.is_shared && r.created_by_user_id !== currentUserId);

  return (
    <aside className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input type="search" placeholder={t('search')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface ps-9 pe-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto">
        {loading && reports.length === 0 ? <p className="px-1 text-xs text-text-tertiary">…</p> : null}
        {own.length > 0 && (
          <Section title={t('mine')} items={own} currentReportId={currentReportId}
            onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} onShare={onShare} />
        )}
        {shared.length > 0 && (
          <Section title={t('sharedWithMe')} items={shared} currentReportId={currentReportId}
            onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} onShare={onShare} />
        )}
        {!loading && filtered.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-xs text-text-tertiary">{t('noReports')}</p>
        )}
      </div>
    </aside>
  );
}

interface SectionProps {
  title: string;
  items: SavedReportListItem[];
  currentReportId: string | null;
  onSelect: (reportId: string) => void;
  onDelete: (report: SavedReportListItem) => void;
  onDuplicate?: (report: SavedReportListItem) => void;
  onShare?: (report: SavedReportListItem) => void;
}

function Section({ title, items, currentReportId, onSelect, onDelete, onDuplicate, onShare }: SectionProps) {
  return (
    <div className="space-y-1">
      <h4 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{title}</h4>
      <ul className="space-y-1">
        {items.map((report) => (
          <SavedReportRow key={report.id} report={report} isActive={currentReportId === report.id}
            onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} onShare={onShare} />
        ))}
      </ul>
    </div>
  );
}

interface SavedReportRowProps {
  report: SavedReportListItem;
  isActive: boolean;
  onSelect: (reportId: string) => void;
  onDelete: (report: SavedReportListItem) => void;
  onDuplicate?: (report: SavedReportListItem) => void;
  onShare?: (report: SavedReportListItem) => void;
}

function SavedReportRow({ report, isActive, onSelect, onDelete, onDuplicate, onShare }: SavedReportRowProps) {
  const t = useTranslations('reports.builder.sidebar');
  const updatedAt = new Date(report.updated_at);
  return (
    <li
      className={`group relative flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${isActive ? 'bg-primary/10' : 'hover:bg-surface-secondary'}`}
      data-testid={`saved-report-${report.id}`}
    >
      <button type="button" onClick={() => onSelect(report.id)} className="flex flex-1 items-center gap-2 text-start" aria-current={isActive ? 'page' : undefined}>
        {report.is_shared && <Share2 className="h-3 w-3 shrink-0 text-text-tertiary" />}
        <span className="flex-1 truncate text-sm text-text-primary">{report.name}</span>
      </button>
      <span className="hidden text-[10px] text-text-tertiary sm:inline">
        {Number.isFinite(updatedAt.getTime()) ? updatedAt.toLocaleDateString() : ''}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-surface group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label="Report actions" data-testid={`report-actions-${report.id}`}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {onDuplicate && (<DropdownMenuItem onClick={() => onDuplicate(report)}><Copy className="me-2 h-3.5 w-3.5" />{t('duplicate')}</DropdownMenuItem>)}
          {onShare && (<DropdownMenuItem onClick={() => onShare(report)}><Share2 className="me-2 h-3.5 w-3.5" />{t('share')}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDelete(report)} className="text-red-600 focus:text-red-700">
            <Trash2 className="me-2 h-3.5 w-3.5" />{t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export const __FavStar = Star;
