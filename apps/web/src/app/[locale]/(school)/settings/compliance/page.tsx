'use client';

import { Plus, Eye, CheckCircle, XCircle, Play, Tag } from 'lucide-react';
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComplianceRequest {
  id: string;
  request_type: string;
  subject_type: string;
  subject_id: string;
  status: string;
  created_at: string;
  classified_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

interface ComplianceResponse {
  data: ComplianceRequest[];
  meta: { page: number; pageSize: number; total: number };
}

const STATUSES = ['all', 'submitted', 'classified', 'approved', 'completed', 'rejected'] as const;
type StatusFilter = (typeof STATUSES)[number];

const REQUEST_TYPES = ['data_export', 'data_deletion', 'data_access', 'data_rectification'];
const SUBJECT_TYPES = ['student', 'parent', 'staff'];

const statusVariantMap: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  submitted: 'neutral',
  classified: 'info',
  approved: 'warning',
  completed: 'success',
  rejected: 'danger',
};

// ─── New Request Dialog ──────────────────────────────────────────────────────

interface NewRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function NewRequestDialog({ open, onOpenChange, onSuccess }: NewRequestDialogProps) {
  const t = useTranslations('compliance');
  const tc = useTranslations('common');

  const [requestType, setRequestType] = React.useState('');
  const [subjectType, setSubjectType] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleClose = () => {
    setRequestType('');
    setSubjectType('');
    setSubjectId('');
    setError('');
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!requestType) { setError(t('requestTypeRequired')); return; }
    if (!subjectType) { setError(t('subjectTypeRequired')); return; }
    if (!subjectId.trim()) { setError(t('subjectIdRequired')); return; }
    setLoading(true);
    setError('');
    try {
      await apiClient('/api/v1/compliance-requests', {
        method: 'POST',
        body: JSON.stringify({
          request_type: requestType,
          subject_type: subjectType,
          subject_id: subjectId.trim(),
        }),
      });
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setError(e?.error?.message ?? tc('noResults'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newRequest')}</DialogTitle>
          <DialogDescription>{t('newRequestDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('requestType')}</Label>
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectRequestType')} />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_TYPES.map((rt) => (
                  <SelectItem key={rt} value={rt}>
                    {rt.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('subjectType')}</Label>
            <Select value={subjectType} onValueChange={setSubjectType}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectSubjectType')} />
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_TYPES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('subjectId')}</Label>
            <Input
              dir="ltr"
              placeholder={t('subjectIdPlaceholder')}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-danger-text">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? tc('loading') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Dialog ───────────────────────────────────────────────────────────

interface DetailDialogProps {
  request: ComplianceRequest | null;
  onClose: () => void;
  onAction: () => void;
}

function DetailDialog({ request, onClose, onAction }: DetailDialogProps) {
  const t = useTranslations('compliance');
  const tc = useTranslations('common');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  if (!request) return null;

  const handleAction = async (actionPath: string) => {
    setLoading(true);
    setError('');
    try {
      await apiClient(`/api/v1/compliance-requests/${request.id}/${actionPath}`, {
        method: 'POST',
      });
      onAction();
      onClose();
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setError(e?.error?.message ?? tc('noResults'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('requestDetail')}</DialogTitle>
          <DialogDescription>
            {request.request_type.replace(/_/g, ' ')} — {request.subject_type}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-tertiary">{t('status')}</span>
            <StatusBadge status={statusVariantMap[request.status] ?? 'neutral'} dot>
              {request.status}
            </StatusBadge>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">{t('subjectId')}</span>
            <span dir="ltr" className="font-mono text-xs">{request.subject_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">{t('created')}</span>
            <span>{formatDate(request.created_at)}</span>
          </div>
          {request.rejection_reason && (
            <div className="rounded-lg border border-danger-fill/20 bg-danger-fill/5 p-3">
              <span className="text-danger-text">{request.rejection_reason}</span>
            </div>
          )}
          {error && <p className="text-sm text-danger-text">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {tc('close')}
          </Button>

          {request.status === 'submitted' && (
            <Button onClick={() => handleAction('classify')} disabled={loading}>
              <Tag className="me-1.5 h-3.5 w-3.5" />
              {loading ? tc('loading') : t('classify')}
            </Button>
          )}

          {request.status === 'classified' && (
            <>
              <Button
                variant="destructive"
                onClick={() => handleAction('reject')}
                disabled={loading}
              >
                <XCircle className="me-1.5 h-3.5 w-3.5" />
                {loading ? tc('loading') : t('reject')}
              </Button>
              <Button onClick={() => handleAction('approve')} disabled={loading}>
                <CheckCircle className="me-1.5 h-3.5 w-3.5" />
                {loading ? tc('loading') : t('approve')}
              </Button>
            </>
          )}

          {request.status === 'approved' && (
            <Button onClick={() => handleAction('execute')} disabled={loading}>
              <Play className="me-1.5 h-3.5 w-3.5" />
              {loading ? tc('loading') : t('execute')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const t = useTranslations('compliance');

  const [data, setData] = React.useState<ComplianceRequest[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [newDialogOpen, setNewDialogOpen] = React.useState(false);
  const [selectedRequest, setSelectedRequest] = React.useState<ComplianceRequest | null>(null);

  const fetchRequests = React.useCallback(
    async (p: number) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(PAGE_SIZE),
        });
        if (statusFilter !== 'all') params.set('status', statusFilter);

        const res = await apiClient<ComplianceResponse>(
          `/api/v1/compliance-requests?${params.toString()}`,
        );
        setData(res.data);
        setTotal(res.meta.total);
      } catch {
        // silently swallowed
      } finally {
        setIsLoading(false);
      }
    },
    [statusFilter],
  );

  React.useEffect(() => {
    void fetchRequests(page);
  }, [page, fetchRequests]);

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const columns = [
    {
      key: 'request_type',
      header: t('requestType'),
      render: (row: ComplianceRequest) => (
        <span className="font-medium text-text-primary">
          {row.request_type.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'subject_type',
      header: t('subjectType'),
      render: (row: ComplianceRequest) => (
        <span className="text-text-secondary">{row.subject_type}</span>
      ),
    },
    {
      key: 'subject_id',
      header: t('subjectId'),
      render: (row: ComplianceRequest) => (
        <span dir="ltr" className="font-mono text-xs text-text-tertiary">
          {row.subject_id}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: ComplianceRequest) => (
        <StatusBadge status={statusVariantMap[row.status] ?? 'neutral'} dot>
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'created_at',
      header: t('created'),
      render: (row: ComplianceRequest) => (
        <span className="text-text-secondary">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (row: ComplianceRequest) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedRequest(row);
          }}
        >
          <Eye className="me-1.5 h-3.5 w-3.5" />
          {t('view')}
        </Button>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {STATUSES.map((s) => (
        <Button
          key={s}
          variant={statusFilter === s ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter(s)}
        >
          {s === 'all' ? t('all') : s}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setNewDialogOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('newRequest')}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onRowClick={setSelectedRequest}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        toolbar={toolbar}
      />

      <NewRequestDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onSuccess={() => void fetchRequests(page)}
      />

      <DetailDialog
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onAction={() => void fetchRequests(page)}
      />
    </div>
  );
}
