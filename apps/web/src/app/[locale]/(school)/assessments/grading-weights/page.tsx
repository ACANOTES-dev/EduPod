'use client';

import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
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
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

interface CategoryWeight {
  category_id: string;
  category_name: string;
  weight: number;
}

interface GradingWeight {
  id: string;
  subject_id: string | null;
  year_group_id: string | null;
  academic_period_id: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  rejection_reason: string | null;
  category_weights: CategoryWeight[];
  /** Raw Prisma JSON — API returns this instead of category_weights */
  category_weights_json?: { weights?: CategoryWeight[] };
  subject?: { id: string; name: string } | null;
  year_group?: { id: string; name: string } | null;
  academic_period?: { id: string; name: string } | null;
}

interface GradingWeightsResponse {
  data: GradingWeight[];
  meta: { page: number; pageSize: number; total: number };
}

/** Extract weights array from the raw API response's category_weights_json field */
function extractWeightsFromJson(item: GradingWeight): CategoryWeight[] {
  return item.category_weights_json?.weights ?? [];
}

interface AssessmentCategory {
  id: string;
  name: string;
  status: string;
}

interface CategoriesResponse {
  data: AssessmentCategory[];
  meta?: { page: number; pageSize: number; total: number };
}

// ─── Status helpers ──────────────────────────────────────────────────────────

type StatusVariant = 'neutral' | 'warning' | 'success' | 'danger';

const STATUS_VARIANT_MAP: Record<GradingWeight['status'], StatusVariant> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradingWeightsPage() {
  const t = useTranslations('teacherAssessments');
  const tc = useTranslations('common');

  // ── List state ──────────────────────────────────────────────────────────────

  const [data, setData] = React.useState<GradingWeight[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState('all');

  // ── Lookup data ─────────────────────────────────────────────────────────────

  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [yearGroups, setYearGroups] = React.useState<SelectOption[]>([]);
  const [periods, setPeriods] = React.useState<SelectOption[]>([]);
  const [categories, setCategories] = React.useState<AssessmentCategory[]>([]);

  // ── Dialog state ────────────────────────────────────────────────────────────

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<GradingWeight | null>(null);
  const [saving, setSaving] = React.useState(false);

  // ── Form fields ─────────────────────────────────────────────────────────────

  const [subjectId, setSubjectId] = React.useState('');
  const [yearGroupId, setYearGroupId] = React.useState('');
  const [periodId, setPeriodId] = React.useState('');
  const [weights, setWeights] = React.useState<Record<string, number>>({});

  // ── Computed ────────────────────────────────────────────────────────────────

  const weightTotal = React.useMemo(
    () => Object.values(weights).reduce((sum, w) => sum + (Number.isNaN(w) ? 0 : w), 0),
    [weights],
  );

  const isWeightValid = Math.abs(weightTotal - 100) < 0.01;

  // ── Fetch helpers ───────────────────────────────────────────────────────────

  const fetchWeights = React.useCallback(async (p: number, status: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (status !== 'all') params.set('status', status);
      const res = await apiClient<GradingWeightsResponse>(
        `/api/v1/gradebook/teacher-grading-weights?${params.toString()}`,
      );
      const raw = Array.isArray(res.data) ? res.data : [];
      // API returns category_weights_json: { weights: [...] } — normalize to category_weights: [...]
      const items = raw.map((item) => ({
        ...item,
        category_weights:
          Array.isArray(item.category_weights) && item.category_weights.length > 0
            ? item.category_weights
            : extractWeightsFromJson(item),
      }));
      setData(items);
      setTotal(res.meta?.total ?? items.length);
    } catch (err) {
      console.error('[GradingWeightsPage]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLookups = React.useCallback(async () => {
    try {
      const [subjectsRes, ygRes, periodsRes, catsRes] = await Promise.all([
        apiClient<ListResponse<SelectOption>>(
          '/api/v1/subjects?pageSize=100&subject_type=academic',
        ),
        apiClient<ListResponse<SelectOption>>('/api/v1/year-groups?pageSize=100'),
        apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50'),
        apiClient<CategoriesResponse>(
          '/api/v1/gradebook/assessment-categories?pageSize=100&status=approved',
        ),
      ]);
      setSubjects(subjectsRes.data);
      setYearGroups(ygRes.data);
      setPeriods(periodsRes.data);
      setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
    } catch (err) {
      console.error('[GradingWeightsPage.lookups]', err);
    }
  }, []);

  React.useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  React.useEffect(() => {
    void fetchWeights(page, statusFilter);
  }, [page, statusFilter, fetchWeights]);

  // ── Form helpers ────────────────────────────────────────────────────────────

  const resetForm = React.useCallback(() => {
    setSubjectId('');
    setYearGroupId('');
    setPeriodId('');
    setWeights({});
  }, []);

  const openCreate = React.useCallback(() => {
    resetForm();
    setEditTarget(null);
    // Pre-populate weights map with all approved categories at 0
    const initial: Record<string, number> = {};
    for (const cat of categories) {
      initial[cat.id] = 0;
    }
    setWeights(initial);
    setDialogOpen(true);
  }, [resetForm, categories]);

  const openEdit = React.useCallback(
    (row: GradingWeight) => {
      setEditTarget(row);
      setSubjectId(row.subject_id ?? '');
      setYearGroupId(row.year_group_id ?? '');
      setPeriodId(row.academic_period_id ?? '');
      const w: Record<string, number> = {};
      for (const cat of categories) {
        const existing = row.category_weights.find((cw) => cw.category_id === cat.id);
        w[cat.id] = existing?.weight ?? 0;
      }
      setWeights(w);
      setDialogOpen(true);
    },
    [categories],
  );

  const handleWeightChange = React.useCallback((categoryId: string, value: string) => {
    const num = value === '' ? 0 : Number(value);
    setWeights((prev) => ({ ...prev, [categoryId]: num }));
  }, []);

  const handleSave = async () => {
    if (!isWeightValid) return;
    setSaving(true);
    try {
      const categoryWeights = Object.entries(weights)
        .filter(([, w]) => w > 0)
        .map(([category_id, weight]) => ({ category_id, weight }));

      const body: Record<string, unknown> = { category_weights: categoryWeights };
      if (subjectId) body.subject_id = subjectId;
      if (yearGroupId) body.year_group_id = yearGroupId;
      if (periodId) body.academic_period_id = periodId;

      if (editTarget) {
        await apiClient(`/api/v1/gradebook/teacher-grading-weights/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/gradebook/teacher-grading-weights', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      toast.success(t('saveSuccess'));
      void fetchWeights(page, statusFilter);
    } catch (err) {
      console.error('[GradingWeightsPage.save]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: GradingWeight) => {
    try {
      await apiClient(`/api/v1/gradebook/teacher-grading-weights/${row.id}`, {
        method: 'DELETE',
      });
      toast.success(t('deleteSuccess'));
      void fetchWeights(page, statusFilter);
    } catch (err) {
      console.error('[GradingWeightsPage.delete]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleSubmitForApproval = async (row: GradingWeight) => {
    try {
      await apiClient(`/api/v1/gradebook/teacher-grading-weights/${row.id}/submit`, {
        method: 'POST',
      });
      toast.success(t('submitSuccess'));
      void fetchWeights(page, statusFilter);
    } catch (err) {
      console.error('[GradingWeightsPage.submit]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const canEdit = (row: GradingWeight) => row.status === 'draft' || row.status === 'rejected';

  const canDelete = (row: GradingWeight) => row.status === 'draft' || row.status === 'rejected';

  const canSubmit = (row: GradingWeight) => row.status === 'draft';

  const statusLabel = (status: GradingWeight['status']): string => {
    const map: Record<GradingWeight['status'], string> = {
      draft: t('draft'),
      pending_approval: t('pendingApproval'),
      approved: t('approved'),
      rejected: t('rejected'),
    };
    return map[status];
  };

  const formatWeightsSummary = (cw: CategoryWeight[]): string => {
    if (cw.length === 0) return '—';
    return cw
      .map((w) => {
        const catName =
          w.category_name || categories.find((c) => c.id === w.category_id)?.name || '?';
        return `${catName} ${w.weight}%`;
      })
      .join(', ');
  };

  // ── Columns ─────────────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'subject',
      header: t('subject'),
      render: (row: GradingWeight) => (
        <span className="font-medium text-text-primary">
          {row.subject?.name ?? t('allSubjects')}
        </span>
      ),
    },
    {
      key: 'yearGroup',
      header: t('yearGroup'),
      render: (row: GradingWeight) => (
        <span className="text-text-secondary">{row.year_group?.name ?? t('allYearGroups')}</span>
      ),
    },
    {
      key: 'period',
      header: t('academicPeriod'),
      render: (row: GradingWeight) => (
        <span className="text-text-secondary">{row.academic_period?.name ?? t('allPeriods')}</span>
      ),
    },
    {
      key: 'weights',
      header: t('categoryWeights'),
      render: (row: GradingWeight) => (
        <span className="text-xs text-text-secondary">
          {formatWeightsSummary(row.category_weights)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: GradingWeight) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={STATUS_VARIANT_MAP[row.status]} dot>
            {statusLabel(row.status)}
          </StatusBadge>
          {row.status === 'rejected' && row.rejection_reason && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="danger" className="cursor-help text-xs">
                    !
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">{row.rejection_reason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: GradingWeight) => (
        <div className="flex items-center gap-1">
          {canSubmit(row) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleSubmitForApproval(row);
              }}
              title={t('submitForApproval')}
            >
              <Send className="h-4 w-4 text-info-text" />
            </Button>
          )}
          {canEdit(row) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(row);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete(row) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(row);
              }}
            >
              <Trash2 className="h-4 w-4 text-danger-text" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  // ── Toolbar ─────────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder={t('filterByStatus')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStatuses')}</SelectItem>
          <SelectItem value="draft">{t('draft')}</SelectItem>
          <SelectItem value="pending_approval">{t('pendingApproval')}</SelectItem>
          <SelectItem value="approved">{t('approved')}</SelectItem>
          <SelectItem value="rejected">{t('rejected')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('gradingWeights')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {t('createWeight')}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      {/* ── Create / Edit Dialog ──────────────────────────────────────────── */}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? t('editWeight') : t('createWeight')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Subject */}
            <div>
              <Label htmlFor="gw-subject">{t('subject')}</Label>
              <Select
                value={subjectId || '__all__'}
                onValueChange={(v) => setSubjectId(v === '__all__' ? '' : v)}
              >
                <SelectTrigger id="gw-subject" className="w-full">
                  <SelectValue placeholder={t('allSubjects')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('allSubjects')}</SelectItem>
                  {subjects
                    .filter((s) => s.id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year Group */}
            <div>
              <Label htmlFor="gw-yg">{t('yearGroup')}</Label>
              <Select
                value={yearGroupId || '__all__'}
                onValueChange={(v) => setYearGroupId(v === '__all__' ? '' : v)}
              >
                <SelectTrigger id="gw-yg" className="w-full">
                  <SelectValue placeholder={t('allYearGroups')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('allYearGroups')}</SelectItem>
                  {yearGroups
                    .filter((yg) => yg.id)
                    .map((yg) => (
                      <SelectItem key={yg.id} value={yg.id}>
                        {yg.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Academic Period */}
            <div>
              <Label htmlFor="gw-period">{t('academicPeriod')}</Label>
              <Select
                value={periodId || '__all__'}
                onValueChange={(v) => setPeriodId(v === '__all__' ? '' : v)}
              >
                <SelectTrigger id="gw-period" className="w-full">
                  <SelectValue placeholder={t('allPeriods')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('allPeriods')}</SelectItem>
                  {periods
                    .filter((p) => p.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Weights */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('categoryWeights')}</Label>
                <span
                  className={`text-sm font-medium ${
                    isWeightValid ? 'text-success-text' : 'text-danger-text'
                  }`}
                >
                  {t('totalWeight')}: {weightTotal}%
                </span>
              </div>

              {categories.length === 0 && (
                <p className="text-sm text-text-tertiary">{t('noCategories')}</p>
              )}

              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {cat.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={weights[cat.id] ?? 0}
                      onChange={(e) => handleWeightChange(cat.id, e.target.value)}
                      className="w-full text-base sm:w-20"
                    />
                    <span className="text-sm text-text-secondary">%</span>
                  </div>
                </div>
              ))}

              {!isWeightValid && Object.keys(weights).length > 0 && (
                <p className="text-sm text-danger-text">{t('weightsMustSum100')}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !isWeightValid}>
              {saving ? tc('loading') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
