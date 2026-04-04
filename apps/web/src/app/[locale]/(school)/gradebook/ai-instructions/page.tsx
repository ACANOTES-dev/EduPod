'use client';

import { Loader2, Plus } from 'lucide-react';
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
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type InstructionStatus = 'draft' | 'pending_approval' | 'active' | 'rejected';

interface SelectOption {
  id: string;
  name: string;
}

interface AiInstruction {
  id: string;
  class_name: string;
  subject_name: string;
  instruction_text: string;
  status: InstructionStatus;
  rejection_reason: string | null;
  submitted_by_name: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
}

interface InstructionsResponse {
  data: AiInstruction[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

// ─── Status badge helper ──────────────────────────────────────────────────────

const STATUS_VARIANT: Record<InstructionStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  pending_approval: 'warning',
  active: 'success',
  rejected: 'danger',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiInstructionsPage() {
  const t = useTranslations('gradebook');
  const tCommon = useTranslations('common');
  const tc = useTranslations('common');

  const [classes, setClasses] = React.useState<SelectOption[]>([]);
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);

  const [rows, setRows] = React.useState<AiInstruction[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<AiInstruction | null>(null);
  const [modalClass, setModalClass] = React.useState('');
  const [modalSubject, setModalSubject] = React.useState('');
  const [modalText, setModalText] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // Reject modal state
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [rejectTarget, setRejectTarget] = React.useState<AiInstruction | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);

  const [actioning, setActioning] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data))
      .catch((err) => { console.error('[GradebookAiInstructionsPage]', err); });
    apiClient<ListResponse<SelectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setSubjects(res.data))
      .catch((err) => { console.error('[GradebookAiInstructionsPage]', err); });
  }, []);

  const fetchRows = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const res = await apiClient<InstructionsResponse>(
        `/api/v1/gradebook/ai-grading-instructions?${params.toString()}`,
      );
      setRows(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[GradebookAiInstructionsPage]', err);
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchRows(page);
  }, [page, fetchRows]);

  const openCreate = () => {
    setEditTarget(null);
    setModalClass('');
    setModalSubject('');
    setModalText('');
    setModalOpen(true);
  };

  const openEdit = (row: AiInstruction) => {
    setEditTarget(row);
    setModalText(row.instruction_text);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!modalText.trim()) return;
    if (!editTarget && (!modalClass || !modalSubject)) return;
    setSaving(true);
    try {
      if (editTarget) {
        await apiClient(`/api/v1/gradebook/ai-grading-instructions/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ instruction_text: modalText }),
        });
      } else {
        await apiClient('/api/v1/gradebook/ai-grading-instructions', {
          method: 'POST',
          body: JSON.stringify({
            class_id: modalClass,
            subject_id: modalSubject,
            instruction_text: modalText,
          }),
        });
      }
      toast.success(tc('saved'));
      setModalOpen(false);
      void fetchRows(page);
    } catch (err) {
      console.error('[GradebookAiInstructionsPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async (id: string) => {
    setActioning(id);
    try {
      await apiClient(`/api/v1/gradebook/ai-grading-instructions/${id}/submit`, {
        method: 'POST',
      });
      toast.success(t('aiInstructionSubmitted'));
      void fetchRows(page);
    } catch (err) {
      console.error('[GradebookAiInstructionsPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setActioning(null);
    }
  };

  const handleApprove = async (id: string) => {
    setActioning(id);
    try {
      await apiClient(`/api/v1/gradebook/ai-grading-instructions/${id}/approve`, {
        method: 'POST',
      });
      toast.success(t('aiInstructionApproved'));
      void fetchRows(page);
    } catch (err) {
      console.error('[GradebookAiInstructionsPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setActioning(null);
    }
  };

  const openRejectModal = (row: AiInstruction) => {
    setRejectTarget(row);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await apiClient(`/api/v1/gradebook/ai-grading-instructions/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejection_reason: rejectReason }),
      });
      toast.success(t('aiInstructionRejected'));
      setRejectModalOpen(false);
      void fetchRows(page);
    } catch (err) {
      console.error('[GradebookAiInstructionsPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setRejecting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('aiInstructionsTitle')}
        description={t('aiInstructionsDescription')}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="me-2 h-4 w-4" />
            {t('aiInstructionsCreate')}
          </Button>
        }
      />

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                {[
                  t('publishingClass'),
                  t('subject'),
                  t('aiInstructionsPreview'),
                  tc('status'),
                  tc('actions'),
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="border-b border-border last:border-b-0">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-secondary" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-text-tertiary">
                    {t('aiInstructionsEmpty')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {row.class_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.subject_name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary max-w-xs">
                      <p className="line-clamp-2">{row.instruction_text}</p>
                      {row.status === 'rejected' && row.rejection_reason && (
                        <p className="mt-1 text-xs text-danger-600 italic">
                          {t('aiInstructionsRejectionReason')}: {row.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={STATUS_VARIANT[row.status]}>
                        {t(`aiInstructionStatus_${row.status}`)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                          {tc('edit')}
                        </Button>
                        {(row.status === 'draft' || row.status === 'rejected') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleSubmitForApproval(row.id)}
                            disabled={actioning === row.id}
                          >
                            {actioning === row.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              t('aiInstructionsSubmit')
                            )}
                          </Button>
                        )}
                        {row.status === 'pending_approval' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => void handleApprove(row.id)}
                              disabled={actioning === row.id}
                            >
                              {actioning === row.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                t('aiInstructionsApprove')
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRejectModal(row)}
                            >
                              {t('aiInstructionsReject')}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-text-secondary">
          <span>{total}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label={tCommon('previous')}
            >
              {'‹'}
            </Button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label={tCommon('next')}
            >
              {'›'}
            </Button>
          </div>
        </div>
      </div>

      {/* Create / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editTarget ? t('aiInstructionsEditTitle') : t('aiInstructionsCreateTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editTarget && (
              <>
                <div className="space-y-1.5">
                  <Label>{t('selectClass')}</Label>
                  <Select value={modalClass} onValueChange={setModalClass}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectClass')} />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('subject')}</Label>
                  <Select value={modalSubject} onValueChange={setModalSubject}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('subject')} />
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
              </>
            )}
            <div className="space-y-1.5">
              <Label>{t('aiInstructionsText')}</Label>
              <Textarea
                value={modalText}
                onChange={(e) => setModalText(e.target.value)}
                rows={6}
                placeholder={t('aiInstructionsTextHint')}
              />
              <p className="text-xs text-text-tertiary">{t('aiInstructionsTextHelp')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving || !modalText.trim() || (!editTarget && (!modalClass || !modalSubject))
              }
            >
              {saving ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {tc('saving')}
                </>
              ) : (
                tc('save')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('aiInstructionsRejectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('aiInstructionsRejectReason')}</Label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('aiInstructionsRejectReasonHint')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
              {rejecting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t('aiInstructionsReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
