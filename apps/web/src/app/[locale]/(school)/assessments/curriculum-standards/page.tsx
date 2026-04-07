'use client';

import { BookOpen, Pencil, Plus, Send, Trash2 } from 'lucide-react';
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
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
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

type StandardStatus = 'draft' | 'pending' | 'approved' | 'rejected';

interface CurriculumStandard {
  id: string;
  code: string;
  description: string;
  status: StandardStatus;
  subject_id: string;
  year_group_id: string;
  subject?: { id: string; name: string };
  year_group?: { id: string; name: string };
}

interface StandardsResponse {
  data: CurriculumStandard[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Status Helpers ──────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<StandardStatus, 'secondary' | 'warning' | 'success' | 'danger'> = {
  draft: 'secondary',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_LABELS: Record<StandardStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CurriculumStandardsPage() {
  const t = useTranslations('teacherAssessments');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<CurriculumStandard[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Filter options
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [yearGroups, setYearGroups] = React.useState<SelectOption[]>([]);
  const [subjectFilter, setSubjectFilter] = React.useState('all');
  const [yearGroupFilter, setYearGroupFilter] = React.useState('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<CurriculumStandard | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);

  // Form state
  const [code, setCode] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('');
  const [yearGroupId, setYearGroupId] = React.useState('');

  // ─── Load filter options ────────────────────────────────────────────────────

  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setSubjects(res.data))
      .catch((err) => {
        console.error('[CurriculumStandardsPage] subjects', err);
      });
    apiClient<ListResponse<SelectOption>>('/api/v1/year-groups?pageSize=100')
      .then((res) => setYearGroups(res.data))
      .catch((err) => {
        console.error('[CurriculumStandardsPage] yearGroups', err);
      });
  }, []);

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchStandards = React.useCallback(
    async (p: number, subject: string, yearGroup: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (subject !== 'all') params.set('subject_id', subject);
        if (yearGroup !== 'all') params.set('year_group_id', yearGroup);
        const res = await apiClient<StandardsResponse>(
          `/api/v1/gradebook/curriculum-standards?${params.toString()}`,
        );
        setData(res.data);
        setTotal(res.meta.total);
      } catch (err) {
        console.error('[CurriculumStandardsPage]', err);
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchStandards(page, subjectFilter, yearGroupFilter);
  }, [page, subjectFilter, yearGroupFilter, fetchStandards]);

  // ─── Form actions ───────────────────────────────────────────────────────────

  const resetForm = () => {
    setCode('');
    setDescription('');
    setSubjectId('');
    setYearGroupId('');
  };

  const openCreate = () => {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (s: CurriculumStandard) => {
    setEditTarget(s);
    setCode(s.code);
    setDescription(s.description);
    setSubjectId(s.subject_id);
    setYearGroupId(s.year_group_id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!code.trim() || !subjectId || !yearGroupId) return;
    setSaving(true);
    try {
      const body = {
        code: code.trim(),
        description: description.trim(),
        subject_id: subjectId,
        year_group_id: yearGroupId,
      };
      if (editTarget) {
        await apiClient(`/api/v1/gradebook/curriculum-standards/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/gradebook/curriculum-standards', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      void fetchStandards(page, subjectFilter, yearGroupFilter);
    } catch (err) {
      console.error('[CurriculumStandardsPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/gradebook/curriculum-standards/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      void fetchStandards(page, subjectFilter, yearGroupFilter);
    } catch (err) {
      console.error('[CurriculumStandardsPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleSubmitForApproval = async (id: string) => {
    setSubmittingId(id);
    try {
      await apiClient(`/api/v1/gradebook/curriculum-standards/${id}/submit`, {
        method: 'POST',
      });
      void fetchStandards(page, subjectFilter, yearGroupFilter);
    } catch (err) {
      console.error('[CurriculumStandardsPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSubmittingId(null);
    }
  };

  // ─── Table columns ─────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'code',
      header: t('standardCode'),
      render: (row: CurriculumStandard) => (
        <span className="font-mono text-sm font-medium text-text-primary">{row.code}</span>
      ),
    },
    {
      key: 'description',
      header: t('description'),
      render: (row: CurriculumStandard) => (
        <span className="text-sm text-text-secondary line-clamp-2">{row.description}</span>
      ),
    },
    {
      key: 'subject',
      header: t('subject'),
      render: (row: CurriculumStandard) => (
        <span className="text-sm text-text-secondary">{row.subject?.name ?? '\u2014'}</span>
      ),
    },
    {
      key: 'year_group',
      header: t('yearGroup'),
      render: (row: CurriculumStandard) => (
        <span className="text-sm text-text-secondary">{row.year_group?.name ?? '\u2014'}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: CurriculumStandard) => (
        <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: CurriculumStandard) => {
        const canEdit = row.status === 'draft' || row.status === 'rejected';
        const canSubmit = row.status === 'draft';
        const canDelete = row.status === 'draft' || row.status === 'rejected';

        return (
          <div className="flex items-center gap-1">
            {canSubmit && (
              <Button
                variant="ghost"
                size="sm"
                disabled={submittingId === row.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSubmitForApproval(row.id);
                }}
                title={t('submitForApproval')}
              >
                <Send className="h-4 w-4 text-info-text" />
              </Button>
            )}
            {canEdit && (
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
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(row.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-danger-text" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('curriculumStandards')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {tc('create')}
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={subjectFilter}
          onValueChange={(v) => {
            setSubjectFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('subject')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allSubjects')}</SelectItem>
            {subjects
              .filter((s) => s.id)
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select
          value={yearGroupFilter}
          onValueChange={(v) => {
            setYearGroupFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('yearGroup')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allYearGroups')}</SelectItem>
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

      {/* Table or empty state */}
      {!isLoading && data.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('noStandards')} />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? tc('edit') : tc('create')} {t('standard')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="std-code">{t('standardCode')}</Label>
              <Input
                id="std-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('eGMath10A1')}
              />
            </div>
            <div>
              <Label htmlFor="std-desc">{t('description')}</Label>
              <Textarea
                id="std-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('standardDescription')}
                rows={3}
              />
            </div>
            <div>
              <Label>{t('subject')}</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectSubject')} />
                </SelectTrigger>
                <SelectContent>
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
            <div>
              <Label>{t('yearGroup')}</Label>
              <Select value={yearGroupId} onValueChange={setYearGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectYearGroup')} />
                </SelectTrigger>
                <SelectContent>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !code.trim() || !subjectId || !yearGroupId}
            >
              {saving ? tc('loading') : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tc('confirmDelete')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('deleteStandardConfirm')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              {tc('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && void handleDelete(confirmDeleteId)}
            >
              {tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
