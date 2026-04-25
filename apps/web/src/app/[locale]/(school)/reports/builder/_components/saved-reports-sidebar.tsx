'use client';

import { Copy, MoreHorizontal, Pencil, Search, Share2, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  cn,
  toast,
} from '@school/ui';

export interface SavedReportListItem {
  id: string;
  name: string;
  description: string | null;
  data_source: string;
  is_shared: boolean;
  visibility: 'private' | 'shared';
  is_favorite: boolean;
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
  onRename?: (report: SavedReportListItem, newName: string) => Promise<boolean>;
  onToggleFavorite?: (report: SavedReportListItem) => Promise<void>;
}

export function SavedReportsSidebar({
  currentUserId,
  reports,
  loading,
  currentReportId,
  onSelect,
  onDelete,
  onDuplicate,
  onShare,
  onRename,
  onToggleFavorite,
}: SavedReportsSidebarProps) {
  const t = useTranslations('reports.builder.sidebar');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [renameTarget, setRenameTarget] = React.useState<SavedReportListItem | null>(null);

  const filtered = React.useMemo(() => {
    if (searchQuery === '') return reports;
    const needle = searchQuery.toLowerCase();
    return reports.filter((r) => r.name.toLowerCase().includes(needle));
  }, [reports, searchQuery]);

  // ─── Sort: favourites pinned to the top, then most-recently-updated ──────
  const sortedFiltered = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [filtered]);

  const own = sortedFiltered.filter((r) => r.created_by_user_id === currentUserId);
  const shared = sortedFiltered.filter(
    (r) => r.is_shared && r.created_by_user_id !== currentUserId,
  );

  return (
    <aside className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="search"
            placeholder={t('search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface ps-9 pe-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {loading && reports.length === 0 ? (
          <p className="px-1 text-xs text-text-tertiary">…</p>
        ) : null}
        {own.length > 0 && (
          <Section
            title={t('mine')}
            items={own}
            currentReportId={currentReportId}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onShare={onShare}
            onRequestRename={(report) => setRenameTarget(report)}
            onToggleFavorite={onToggleFavorite}
            canFavorite
          />
        )}
        {shared.length > 0 && (
          <Section
            title={t('sharedWithMe')}
            items={shared}
            currentReportId={currentReportId}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onShare={onShare}
            onRequestRename={(report) => setRenameTarget(report)}
            onToggleFavorite={onToggleFavorite}
            canFavorite={false}
          />
        )}
        {!loading && filtered.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-xs text-text-tertiary">
            {t('noReports')}
          </p>
        )}
      </div>

      <RenameDialog
        report={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={onRename}
      />
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
  onRequestRename: (report: SavedReportListItem) => void;
  onToggleFavorite?: (report: SavedReportListItem) => Promise<void>;
  canFavorite: boolean;
}

function Section({
  title,
  items,
  currentReportId,
  onSelect,
  onDelete,
  onDuplicate,
  onShare,
  onRequestRename,
  onToggleFavorite,
  canFavorite,
}: SectionProps) {
  return (
    <div className="space-y-1">
      <h4 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </h4>
      <ul className="space-y-1">
        {items.map((report) => (
          <SavedReportRow
            key={report.id}
            report={report}
            isActive={currentReportId === report.id}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onShare={onShare}
            onRequestRename={onRequestRename}
            onToggleFavorite={onToggleFavorite}
            canFavorite={canFavorite}
          />
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
  onRequestRename: (report: SavedReportListItem) => void;
  onToggleFavorite?: (report: SavedReportListItem) => Promise<void>;
  canFavorite: boolean;
}

function SavedReportRow({
  report,
  isActive,
  onSelect,
  onDelete,
  onDuplicate,
  onShare,
  onRequestRename,
  onToggleFavorite,
  canFavorite,
}: SavedReportRowProps) {
  const t = useTranslations('reports.builder.sidebar');
  const updatedAt = new Date(report.updated_at);
  const [favPending, setFavPending] = React.useState(false);

  const handleFavClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onToggleFavorite || favPending) return;
    setFavPending(true);
    try {
      await onToggleFavorite(report);
    } finally {
      setFavPending(false);
    }
  };

  return (
    <li
      className={cn(
        'group relative flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
        isActive ? 'bg-primary/10' : 'hover:bg-surface-secondary',
      )}
      data-testid={`saved-report-${report.id}`}
    >
      {canFavorite && onToggleFavorite ? (
        <button
          type="button"
          onClick={handleFavClick}
          disabled={favPending}
          className={cn(
            'rounded p-0.5 transition-colors',
            report.is_favorite
              ? 'text-amber-500'
              : 'text-text-tertiary hover:text-amber-500',
          )}
          aria-pressed={report.is_favorite}
          aria-label={report.is_favorite ? t('unfavorite') : t('favorite')}
          data-testid={`favorite-${report.id}`}
        >
          <Star
            className={cn('h-3.5 w-3.5', report.is_favorite ? 'fill-current' : 'fill-none')}
          />
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => onSelect(report.id)}
        className="flex flex-1 items-center gap-2 text-start"
        aria-current={isActive ? 'page' : undefined}
      >
        {report.is_shared && <Share2 className="h-3 w-3 shrink-0 text-text-tertiary" />}
        <span className="flex-1 truncate text-sm text-text-primary">{report.name}</span>
      </button>

      <span className="hidden text-[10px] text-text-tertiary sm:inline">
        {Number.isFinite(updatedAt.getTime()) ? updatedAt.toLocaleDateString() : ''}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-surface group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={t('actions')}
            data-testid={`report-actions-${report.id}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => onSelect(report.id)}>
            <Pencil className="me-2 h-3.5 w-3.5" />
            {t('open')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRequestRename(report)}>
            <Pencil className="me-2 h-3.5 w-3.5" />
            {t('rename')}
          </DropdownMenuItem>
          {onDuplicate && (
            <DropdownMenuItem onClick={() => onDuplicate(report)}>
              <Copy className="me-2 h-3.5 w-3.5" />
              {t('duplicate')}
            </DropdownMenuItem>
          )}
          {onShare && (
            <DropdownMenuItem
              onClick={() => onShare(report)}
              data-testid={`share-${report.id}`}
            >
              <Share2 className="me-2 h-3.5 w-3.5" />
              {t('share')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(report)}
            className="text-red-600 focus:text-red-700"
          >
            <Trash2 className="me-2 h-3.5 w-3.5" />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

interface RenameDialogProps {
  report: SavedReportListItem | null;
  onClose: () => void;
  onRename?: (report: SavedReportListItem, newName: string) => Promise<boolean>;
}

function RenameDialog({ report, onClose, onRename }: RenameDialogProps) {
  const t = useTranslations('reports.builder.sidebar');
  const [name, setName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    setName(report?.name ?? '');
  }, [report]);

  const submit = async () => {
    if (!report || !onRename) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error(t('renameDialog.nameRequired'));
      return;
    }
    if (trimmed === report.name) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      const success = await onRename(report, trimmed);
      if (success) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={report !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('renameDialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rename-input">{t('renameDialog.name')}</Label>
            <Input
              id="rename-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) void submit();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t('renameDialog.cancel')}
          </Button>
          <Button type="button" disabled={submitting || name.trim().length === 0} onClick={submit}>
            {t('renameDialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const __FavStar = Star;
