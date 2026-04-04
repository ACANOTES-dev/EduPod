'use client';

import { BookOpen, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
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

interface CurriculumStandard {
  id: string;
  code: string;
  description: string;
  subject_id: string;
  year_group_id: string;
  subject?: { id: string; name: string };
  year_group?: { id: string; name: string };
}

interface StandardsResponse {
  data: CurriculumStandard[];
  meta: { page: number; pageSize: number; total: number };
}

interface CsvRow {
  code: string;
  description: string;
  subject_name: string;
  year_group_name: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CurriculumStandardsPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<CurriculumStandard[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Filter state
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [yearGroups, setYearGroups] = React.useState<SelectOption[]>([]);
  const [subjectFilter, setSubjectFilter] = React.useState('all');
  const [yearGroupFilter, setYearGroupFilter] = React.useState('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<CurriculumStandard | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  // Form state
  const [code, setCode] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('');
  const [yearGroupId, setYearGroupId] = React.useState('');

  // CSV import state
  const [importDialogOpen, setImportDialogOpen] = React.useState(false);
  const [csvPreview, setCsvPreview] = React.useState<CsvRow[]>([]);
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [importing, setImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load filter options
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setSubjects(res.data))
      .catch((err) => { console.error('[SettingsCurriculumStandardsPage]', err); });
    apiClient<ListResponse<SelectOption>>('/api/v1/year-groups?pageSize=100')
      .then((res) => setYearGroups(res.data))
      .catch((err) => { console.error('[SettingsCurriculumStandardsPage]', err); });
  }, []);

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
        console.error('[SettingsCurriculumStandardsPage]', err);
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
      console.error('[SettingsCurriculumStandardsPage]', err);
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
      console.error('[SettingsCurriculumStandardsPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  // CSV parsing
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split('\n');
      // Expect header: code,description,subject_name,year_group_name
      const rows = lines.slice(1).map((line) => {
        const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
        return {
          code: parts[0] ?? '',
          description: parts[1] ?? '',
          subject_name: parts[2] ?? '',
          year_group_name: parts[3] ?? '',
        };
      });
      setCsvPreview(rows.filter((r) => r.code));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvFile || csvPreview.length === 0) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      // Use raw fetch since apiClient sets Content-Type to application/json
      const { getAccessToken } = await import('@/lib/api-client');
      const token = getAccessToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${apiUrl}/api/v1/gradebook/curriculum-standards/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) throw new Error('Import failed');
      toast.success(t('importSuccess'));
      setImportDialogOpen(false);
      setCsvPreview([]);
      setCsvFile(null);
      void fetchStandards(1, subjectFilter, yearGroupFilter);
    } catch (err) {
      console.error('[SettingsCurriculumStandardsPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setImporting(false);
    }
  };

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
        <span className="text-sm text-text-secondary">{row.subject?.name ?? '—'}</span>
      ),
    },
    {
      key: 'year_group',
      header: t('yearGroup'),
      render: (row: CurriculumStandard) => (
        <span className="text-sm text-text-secondary">{row.year_group?.name ?? '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: CurriculumStandard) => (
        <div className="flex items-center gap-1">
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
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('curriculumStandards')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="me-2 h-4 w-4" />
              {t('importCsv')}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="me-2 h-4 w-4" />
              {tc('create')}
            </Button>
          </div>
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
            {subjects.map((s) => (
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
            {yearGroups.map((yg) => (
              <SelectItem key={yg.id} value={yg.id}>
                {yg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
                  <SelectValue placeholder={`Select ${t('subject').toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
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
                  {yearGroups.map((yg) => (
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

      {/* Delete confirmation */}
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

      {/* CSV Import dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('importCurriculumStandards')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-secondary/40 p-4">
              <p className="text-sm font-medium text-text-primary">{t('csvFormat')}</p>
              <p className="mt-1 text-xs text-text-secondary font-mono">{t('codeDescriptionSubjectNameYear')}</p>
              <p className="mt-1 text-xs text-text-secondary font-mono">{t('math10A1SolveLinear')}</p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Upload className="me-2 h-4 w-4" />
                {csvFile ? csvFile.name : t('selectCsvFile')}
              </Button>
            </div>

            {csvPreview.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-text-primary">
                  {t('preview')}: {csvPreview.length} {t('standards')}
                </p>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-secondary">
                        <th className="px-3 py-2 text-start font-medium text-text-secondary">{t('standardCode')}</th>
                        <th className="px-3 py-2 text-start font-medium text-text-secondary">{t('description')}</th>
                        <th className="px-3 py-2 text-start font-medium text-text-secondary">{t('subject')}</th>
                        <th className="px-3 py-2 text-start font-medium text-text-secondary">{t('yearGroup')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2 font-mono text-text-primary">{row.code}</td>
                          <td className="px-3 py-2 text-text-secondary line-clamp-1">
                            {row.description}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{row.subject_name}</td>
                          <td className="px-3 py-2 text-text-secondary">{row.year_group_name}</td>
                        </tr>
                      ))}
                      {csvPreview.length > 20 && (
                        <tr className="border-t border-border">
                          <td colSpan={4} className="px-3 py-2 text-center text-text-tertiary">
                            +{csvPreview.length - 20}{t('moreRows')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleImport} disabled={importing || csvPreview.length === 0}>
              {importing ? tc('loading') : t('importStandards')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
