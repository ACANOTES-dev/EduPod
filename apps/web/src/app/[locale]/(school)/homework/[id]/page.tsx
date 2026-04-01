'use client';

import { Copy, Edit, FileText, Link as Link2, Trash2, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
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
  StatusBadge,
  toast,
} from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CompletionDonut } from '../_components/completion-donut';
import { HomeworkTypeBadge } from '../_components/homework-type-badge';


// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeworkDetail {
  id: string;
  title: string;
  description?: string;
  class_entity?: { id: string; name: string };
  subject?: { id: string; name: string };
  homework_type: string;
  due_date: string;
  due_time?: string;
  status: string;
  max_points?: number;
  assigned_by_user?: { first_name: string; last_name: string };
  created_at: string;
  attachments?: Array<{ id: string; attachment_type: string; file_name?: string; url?: string }>;
}

interface CompletionRate {
  total_students: number;
  completed: number;
  in_progress: number;
  not_started: number;
}

interface CompletionPreview {
  student_id: string;
  student?: { first_name: string; last_name: string };
  status: string;
  points_awarded?: number;
}

const STATUS_MAP: Record<string, 'warning' | 'success' | 'neutral'> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

const ATTACH_ICON: Record<string, React.ReactNode> = {
  file: <FileText className="h-4 w-4" />,
  link: <Link2 className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomeworkDetailPage() {
  const t = useTranslations('homework');
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [hw, setHw] = React.useState<HomeworkDetail | null>(null);
  const [rate, setRate] = React.useState<CompletionRate | null>(null);
  const [completions, setCompletions] = React.useState<CompletionPreview[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [hwRes, rateRes, compRes] = await Promise.all([
        apiClient<{ data: HomeworkDetail }>(`/api/v1/homework/${id}`),
        apiClient<CompletionRate>(`/api/v1/homework/${id}/completion-rate`, { silent: true }).catch(
          () => null,
        ),
        apiClient<{ data: CompletionPreview[] }>(`/api/v1/homework/${id}/completions?pageSize=10`, {
          silent: true,
        }).catch(() => ({ data: [] })),
      ]);
      setHw(hwRes.data);
      setRate(rateRes);
      setCompletions(compRes.data ?? []);
    } catch {
      console.error('[HomeworkDetail] Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCopy = async () => {
    try {
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      const res = await apiClient<{ data: { id: string } }>(`/api/v1/homework/${id}/copy`, {
        method: 'POST',
        body: JSON.stringify({ due_date: tmrw.toISOString().slice(0, 10) }),
      });
      toast.success(t('homeworkCopied'));
      router.push(`/${locale}/homework/${res.data.id}`);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await apiClient(`/api/v1/homework/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(t('statusUpdated'));
      void fetchData();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient(`/api/v1/homework/${id}`, { method: 'DELETE' });
      toast.success(t('homeworkDeleted'));
      router.push(`/${locale}/homework`);
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  if (!hw) {
    return <EmptyState icon={FileText} title={t('notFound')} description="" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={hw.title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/${locale}/homework/${id}/edit`}>
              <Button variant="outline" size="sm">
                <Edit className="me-1 h-4 w-4" />
                {t('edit')}
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="me-1 h-4 w-4" />
              {t('copy')}
            </Button>
            {hw.status === 'draft' && (
              <Button size="sm" onClick={() => handleStatusChange('published')}>
                {t('publish')}
              </Button>
            )}
            {hw.status === 'published' && (
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('archived')}>
                {t('archive')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="me-1 h-4 w-4" />
              {t('delete')}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4 rounded-2xl bg-surface-secondary p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-text-tertiary">{t('class')}</p>
              <p className="text-sm font-medium text-text-primary">
                {hw.class_entity?.name ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">{t('subject')}</p>
              <p className="text-sm font-medium text-text-primary">{hw.subject?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">{t('type')}</p>
              <HomeworkTypeBadge type={hw.homework_type} />
            </div>
            <div>
              <p className="text-xs text-text-tertiary">{t('dueDate')}</p>
              <p className="text-sm font-medium text-text-primary">
                {formatDate(hw.due_date)}
                {hw.due_time ? ` at ${hw.due_time}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">{t('status')}</p>
              <StatusBadge status={STATUS_MAP[hw.status] ?? 'neutral'}>{hw.status}</StatusBadge>
            </div>
            {hw.max_points != null && (
              <div>
                <p className="text-xs text-text-tertiary">{t('maxPoints')}</p>
                <p className="text-sm font-medium text-text-primary">{hw.max_points}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-text-tertiary">{t('assignedBy')}</p>
              <p className="text-sm font-medium text-text-primary">
                {hw.assigned_by_user
                  ? `${hw.assigned_by_user.first_name} ${hw.assigned_by_user.last_name}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">{t('created')}</p>
              <p className="text-sm font-medium text-text-primary">{formatDate(hw.created_at)}</p>
            </div>
          </div>

          {hw.description && (
            <div className="border-t border-border pt-4">
              <p className="text-xs text-text-tertiary mb-1">{t('description')}</p>
              <p className="whitespace-pre-wrap text-sm text-text-primary">{hw.description}</p>
            </div>
          )}

          {hw.attachments && hw.attachments.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-xs text-text-tertiary mb-2">{t('attachments')}</p>
              <div className="space-y-1">
                {hw.attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm text-text-primary">
                    {ATTACH_ICON[a.attachment_type] ?? <FileText className="h-4 w-4" />}
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline"
                      >
                        {a.file_name ?? a.url}
                      </a>
                    ) : (
                      <span>{a.file_name ?? '—'}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {rate && (
            <div className="rounded-2xl bg-surface-secondary p-4 flex flex-col items-center">
              <CompletionDonut
                completed={rate.completed}
                inProgress={rate.in_progress}
                notStarted={rate.not_started}
              />
              <Link
                href={`/${locale}/homework/${id}/completions`}
                className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                {t('viewAllCompletions')}
              </Link>
            </div>
          )}

          {completions.length > 0 && (
            <div className="rounded-2xl bg-surface-secondary p-4">
              <p className="text-xs font-semibold text-text-tertiary mb-2">{t('completions')}</p>
              <div className="space-y-1">
                {completions.map((c) => (
                  <div key={c.student_id} className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">
                      {c.student ? `${c.student.first_name} ${c.student.last_name}` : c.student_id}
                    </span>
                    <StatusBadge
                      status={
                        c.status === 'completed'
                          ? 'success'
                          : c.status === 'in_progress'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {c.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmDelete')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary py-2">{t('confirmDeleteDesc')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
