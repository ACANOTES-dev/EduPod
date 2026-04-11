'use client';

import { AlertCircle, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

// ─── Domain types ─────────────────────────────────────────────────────────────

type Severity = 'low' | 'medium' | 'high';

const SEVERITIES: Severity[] = ['low', 'medium', 'high'];

const CATEGORIES = [
  'bullying',
  'self_harm',
  'abuse',
  'inappropriate_contact',
  'weapons',
  'other',
] as const;
type Category = (typeof CATEGORIES)[number];

interface SafeguardingKeyword {
  id: string;
  keyword: string;
  severity: Severity;
  category: Category;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface KeywordListResponse {
  data: SafeguardingKeyword[];
}

interface BulkImportRow {
  keyword: string;
  severity: Severity;
  category: Category;
}

interface BulkImportPreview {
  row: number;
  raw: string;
  parsed?: BulkImportRow;
  error?: string;
}

const ADMIN_TIER_ROLE_KEYS = ['school_owner', 'school_principal', 'school_vice_principal'];

const PAGE_SIZE = 50;

// ─── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: Severity }) {
  const t = useTranslations('safeguarding.keywords.severity');
  const classes: Record<Severity, string> = {
    low: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    medium:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30',
    high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${classes[severity]}`}
    >
      {t(severity)}
    </span>
  );
}

// ─── Bulk import helpers ──────────────────────────────────────────────────────

function parseBulkImport(text: string): BulkImportPreview[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.map((line, idx) => {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) {
      return { row: idx + 1, raw: line, error: 'Expected 3 columns: keyword, severity, category' };
    }
    const [keyword, severityRaw, categoryRaw] = parts;
    if (!keyword || keyword.length > 255) {
      return { row: idx + 1, raw: line, error: 'Keyword missing or too long (max 255)' };
    }
    const severity = severityRaw as Severity;
    if (!SEVERITIES.includes(severity)) {
      return {
        row: idx + 1,
        raw: line,
        error: `Severity must be one of ${SEVERITIES.join(' | ')}`,
      };
    }
    const category = categoryRaw as Category;
    if (!CATEGORIES.includes(category)) {
      return {
        row: idx + 1,
        raw: line,
        error: `Category must be one of ${CATEGORIES.join(' | ')}`,
      };
    }
    return { row: idx + 1, raw: line, parsed: { keyword, severity, category } };
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SafeguardingKeywordsPage() {
  const t = useTranslations('safeguarding.keywords');
  const tCat = useTranslations('safeguarding.keywords.category');
  const { user } = useAuth();

  const roleKeys = React.useMemo(
    () => user?.memberships?.flatMap((m) => m.roles?.map((r) => r.role_key) ?? []) ?? [],
    [user],
  );
  const isAdminTier = React.useMemo(
    () => roleKeys.some((r) => ADMIN_TIER_ROLE_KEYS.includes(r)),
    [roleKeys],
  );

  const [keywords, setKeywords] = React.useState<SafeguardingKeyword[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState<'all' | Category>('all');
  const [severityFilter, setSeverityFilter] = React.useState<'all' | Severity>('all');
  const [activeFilter, setActiveFilter] = React.useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = React.useState(1);

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SafeguardingKeyword | null>(null);
  const [formKeyword, setFormKeyword] = React.useState('');
  const [formSeverity, setFormSeverity] = React.useState<Severity>('medium');
  const [formCategory, setFormCategory] = React.useState<Category>('other');
  const [isSaving, setIsSaving] = React.useState(false);

  const [isBulkOpen, setIsBulkOpen] = React.useState(false);
  const [bulkText, setBulkText] = React.useState('');
  const [bulkPreview, setBulkPreview] = React.useState<BulkImportPreview[] | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<SafeguardingKeyword | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  const fetchKeywords = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<KeywordListResponse>('/api/v1/safeguarding/keywords');
      setKeywords(res.data ?? []);
    } catch (err) {
      console.error('[SafeguardingKeywordsPage.fetch]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isAdminTier) {
      setIsLoading(false);
      return;
    }
    void fetchKeywords();
  }, [fetchKeywords, isAdminTier]);

  // ─── Filtering ──────────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return keywords.filter((k) => {
      if (needle && !k.keyword.toLowerCase().includes(needle)) return false;
      if (categoryFilter !== 'all' && k.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && k.severity !== severityFilter) return false;
      if (activeFilter === 'active' && !k.active) return false;
      if (activeFilter === 'inactive' && k.active) return false;
      return true;
    });
  }, [keywords, search, categoryFilter, severityFilter, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = React.useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  React.useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, severityFilter, activeFilter]);

  // ─── Form handlers ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setFormKeyword('');
    setFormSeverity('medium');
    setFormCategory('other');
    setIsFormOpen(true);
  };

  const openEdit = (row: SafeguardingKeyword) => {
    setEditing(row);
    setFormKeyword(row.keyword);
    setFormSeverity(row.severity);
    setFormCategory(row.category);
    setIsFormOpen(true);
  };

  const submitForm = async () => {
    if (!formKeyword.trim()) {
      toast.error(t('validation.keywordRequired'));
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        await apiClient(`/api/v1/safeguarding/keywords/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            keyword: formKeyword.trim(),
            severity: formSeverity,
            category: formCategory,
          }),
        });
        toast.success(t('toasts.updated'));
      } else {
        await apiClient('/api/v1/safeguarding/keywords', {
          method: 'POST',
          body: JSON.stringify({
            keyword: formKeyword.trim(),
            severity: formSeverity,
            category: formCategory,
          }),
        });
        toast.success(t('toasts.created'));
      }
      setIsFormOpen(false);
      await fetchKeywords();
    } catch (err) {
      console.error('[SafeguardingKeywordsPage.submitForm]', err);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (row: SafeguardingKeyword, next: boolean) => {
    setKeywords((prev) => prev.map((k) => (k.id === row.id ? { ...k, active: next } : k)));
    try {
      await apiClient(`/api/v1/safeguarding/keywords/${row.id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ active: next }),
      });
    } catch (err) {
      console.error('[SafeguardingKeywordsPage.toggleActive]', err);
      setKeywords((prev) => prev.map((k) => (k.id === row.id ? { ...k, active: !next } : k)));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient(`/api/v1/safeguarding/keywords/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success(t('toasts.deleted'));
      setDeleteTarget(null);
      await fetchKeywords();
    } catch (err) {
      console.error('[SafeguardingKeywordsPage.delete]', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Bulk import handlers ───────────────────────────────────────────────────
  const openBulk = () => {
    setBulkText('');
    setBulkPreview(null);
    setIsBulkOpen(true);
  };

  const parseBulk = () => {
    setBulkPreview(parseBulkImport(bulkText));
  };

  const importBulk = async () => {
    if (!bulkPreview) return;
    const valid = bulkPreview.filter((r) => r.parsed).map((r) => r.parsed as BulkImportRow);
    if (valid.length === 0) {
      toast.error(t('toasts.bulkNoValid'));
      return;
    }
    setIsImporting(true);
    try {
      const res = await apiClient<{ imported: number; skipped: number }>(
        '/api/v1/safeguarding/keywords/bulk-import',
        {
          method: 'POST',
          body: JSON.stringify({ keywords: valid }),
        },
      );
      toast.success(t('toasts.bulkImported', { imported: res.imported, skipped: res.skipped }));
      setIsBulkOpen(false);
      await fetchKeywords();
    } catch (err) {
      console.error('[SafeguardingKeywordsPage.importBulk]', err);
    } finally {
      setIsImporting(false);
    }
  };

  // ─── Render: not admin ──────────────────────────────────────────────────────
  if (!isAdminTier) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-6">
          <AlertCircle className="h-5 w-5 shrink-0 text-text-secondary" />
          <div>
            <h2 className="text-base font-semibold text-text-primary">{t('denied.title')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('denied.description')}</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button variant="outline" onClick={openBulk}>
              <Upload className="me-2 h-4 w-4" />
              {t('bulk_import')}
            </Button>
            <Button onClick={openAdd}>
              <Plus className="me-2 h-4 w-4" />
              {t('add')}
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            type="search"
            placeholder={t('filters.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full ps-9 text-base"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as 'all' | Category)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allCategories')}</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {tCat(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severityFilter}
          onValueChange={(v) => setSeverityFilter(v as 'all' | Severity)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allSeverities')}</SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`severity.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as 'all' | 'active' | 'inactive')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
            <SelectItem value="active">{t('filters.active')}</SelectItem>
            <SelectItem value="inactive">{t('filters.inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-surface">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <div className="h-10 animate-pulse rounded bg-surface-secondary" />
            <div className="h-10 animate-pulse rounded bg-surface-secondary" />
            <div className="h-10 animate-pulse rounded bg-surface-secondary" />
          </div>
        ) : paged.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">{t('empty_state')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-secondary">
                <tr>
                  <th className="p-3 text-start font-medium text-text-secondary">
                    {t('fields.keyword')}
                  </th>
                  <th className="p-3 text-start font-medium text-text-secondary">
                    {t('fields.severity')}
                  </th>
                  <th className="p-3 text-start font-medium text-text-secondary">
                    {t('fields.category')}
                  </th>
                  <th className="p-3 text-start font-medium text-text-secondary">
                    {t('fields.active')}
                  </th>
                  <th className="p-3 text-start font-medium text-text-secondary">
                    {t('fields.updated')}
                  </th>
                  <th className="p-3 text-end font-medium text-text-secondary">
                    {t('fields.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="font-medium text-text-primary hover:underline"
                      >
                        {row.keyword}
                      </button>
                    </td>
                    <td className="p-3">
                      <SeverityBadge severity={row.severity} />
                    </td>
                    <td className="p-3 text-text-secondary">{tCat(row.category)}</td>
                    <td className="p-3">
                      <Switch
                        checked={row.active}
                        onCheckedChange={(checked) => void toggleActive(row, checked)}
                        aria-label={t('toggle_active')}
                      />
                    </td>
                    <td className="p-3 text-text-tertiary">
                      {new Date(row.updated_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-end">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(row)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-red-600"
                        aria-label={t('delete.confirmButton')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>
            {t('pagination.showing', {
              from: (currentPage - 1) * PAGE_SIZE + 1,
              to: Math.min(currentPage * PAGE_SIZE, filtered.length),
              total: filtered.length,
            })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              {t('pagination.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              {t('pagination.next')}
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('edit_title') : t('add_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="form-keyword">{t('fields.keyword')}</Label>
              <Input
                id="form-keyword"
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
                className="w-full text-base"
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="form-severity">{t('fields.severity')}</Label>
              <Select value={formSeverity} onValueChange={(v) => setFormSeverity(v as Severity)}>
                <SelectTrigger id="form-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`severity.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-text-tertiary">{t('severity_hint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="form-category">{t('fields.category')}</Label>
              <Select value={formCategory} onValueChange={(v) => setFormCategory(v as Category)}>
                <SelectTrigger id="form-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {tCat(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
              {t('form.cancel')}
            </Button>
            <Button onClick={submitForm} disabled={isSaving}>
              {isSaving ? t('form.saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk import dialog */}
      <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('bulk.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{t('bulk.description')}</p>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'bully,high,bullying\nknife,high,weapons'}
              rows={8}
              className="font-mono text-sm"
            />
            <Button variant="outline" onClick={parseBulk} disabled={!bulkText.trim()}>
              {t('bulk.parse')}
            </Button>
            {bulkPreview && bulkPreview.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-secondary">
                    <tr>
                      <th className="p-2 text-start font-medium text-text-secondary">#</th>
                      <th className="p-2 text-start font-medium text-text-secondary">
                        {t('bulk.row')}
                      </th>
                      <th className="p-2 text-start font-medium text-text-secondary">
                        {t('bulk.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.map((r) => (
                      <tr
                        key={r.row}
                        className={`border-t border-border ${
                          r.error ? 'bg-red-50 dark:bg-red-500/5' : ''
                        }`}
                      >
                        <td className="p-2 text-text-tertiary">{r.row}</td>
                        <td className="p-2 font-mono text-xs">{r.raw}</td>
                        <td className="p-2">
                          {r.error ? (
                            <span className="text-xs text-red-600 dark:text-red-400">
                              {r.error}
                            </span>
                          ) : (
                            <span className="text-xs text-green-600 dark:text-green-400">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkOpen(false)} disabled={isImporting}>
              {t('form.cancel')}
            </Button>
            <Button
              onClick={importBulk}
              disabled={isImporting || !bulkPreview || bulkPreview.every((r) => !!r.error)}
            >
              {isImporting ? t('form.saving') : t('bulk.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete.title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            {t('delete.confirm', { keyword: deleteTarget?.keyword ?? '' })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              {t('form.cancel')}
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? t('form.saving') : t('delete.confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
