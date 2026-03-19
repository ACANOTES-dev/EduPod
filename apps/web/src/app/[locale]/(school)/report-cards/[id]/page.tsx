'use client';

import { ArrowLeft, Download, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import {
  Button,
  StatusBadge,
  Textarea,
  Label,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { PdfPreviewModal } from '../_components/pdf-preview-modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportCardDetail {
  id: string;
  student_name: string;
  academic_period_name: string;
  status: string;
  locale: string;
  teacher_comment: string | null;
  principal_comment: string | null;
  published_at: string | null;
  created_at: string;
  snapshot_payload: Record<string, unknown> | null;
  revision_chain: Array<{
    id: string;
    version: number;
    status: string;
    created_at: string;
  }>;
}

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'neutral'> = {
  draft: 'warning',
  published: 'success',
  revised: 'neutral',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardDetailPage() {
  const t = useTranslations('reportCards');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const params = useParams();
  const id = params?.id as string;

  const [reportCard, setReportCard] = React.useState<ReportCardDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [teacherComment, setTeacherComment] = React.useState('');
  const [principalComment, setPrincipalComment] = React.useState('');
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const fetchReportCard = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: ReportCardDetail }>(`/api/v1/report-cards/${id}`);
      setReportCard(res.data);
      setTeacherComment(res.data.teacher_comment ?? '');
      setPrincipalComment(res.data.principal_comment ?? '');
    } catch {
      setReportCard(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchReportCard();
  }, [fetchReportCard]);

  const handleSaveComments = async () => {
    if (!reportCard) return;
    setSaving(true);
    try {
      await apiClient(`/api/v1/report-cards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          teacher_comment: teacherComment || null,
          principal_comment: principalComment || null,
        }),
      });
      toast.success('Comments saved');
      void fetchReportCard();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    try {
      await apiClient(`/api/v1/report-cards/${id}/publish`, { method: 'POST' });
      void fetchReportCard();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handleRevise = async () => {
    try {
      await apiClient(`/api/v1/report-cards/${id}/revise`, { method: 'POST' });
      void fetchReportCard();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handlePreview = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    setPreviewUrl(`${baseUrl}/api/v1/report-cards/${id}/pdf`);
  };

  const handleDownload = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    window.open(`${baseUrl}/api/v1/report-cards/${id}/pdf?download=true`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  if (!reportCard) {
    return (
      <div className="py-12 text-center text-text-tertiary">Report card not found</div>
    );
  }

  const isDraft = reportCard.status === 'draft';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/report-cards`)}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <PageHeader
          title={t('title')}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePreview}>
                <FileText className="me-2 h-4 w-4" />
                {t('preview')}
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="me-2 h-4 w-4" />
                {t('download')}
              </Button>
              {reportCard.status === 'draft' && (
                <Button onClick={handlePublish}>{t('publish')}</Button>
              )}
              {reportCard.status === 'published' && (
                <Button variant="outline" onClick={handleRevise}>{t('revise')}</Button>
              )}
            </div>
          }
        />
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-text-tertiary uppercase">Student</p>
            <p className="mt-1 text-sm font-medium text-text-primary">{reportCard.student_name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-tertiary uppercase">Period</p>
            <p className="mt-1 text-sm text-text-primary">{reportCard.academic_period_name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-tertiary uppercase">Status</p>
            <div className="mt-1">
              <StatusBadge status={STATUS_VARIANT[reportCard.status] ?? 'neutral'} dot>
                {t(`status${reportCard.status.charAt(0).toUpperCase() + reportCard.status.slice(1)}` as 'statusDraft' | 'statusPublished' | 'statusRevised')}
              </StatusBadge>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-text-tertiary uppercase">Locale</p>
            <p className="mt-1 text-sm font-mono text-text-primary uppercase" dir="ltr">{reportCard.locale}</p>
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="teacher-comment">{t('teacherComment')}</Label>
          <Textarea
            id="teacher-comment"
            value={teacherComment}
            onChange={(e) => setTeacherComment(e.target.value)}
            disabled={!isDraft}
            rows={3}
          />
        </div>
        <div>
          <Label htmlFor="principal-comment">{t('principalComment')}</Label>
          <Textarea
            id="principal-comment"
            value={principalComment}
            onChange={(e) => setPrincipalComment(e.target.value)}
            disabled={!isDraft}
            rows={3}
          />
        </div>
        {isDraft && (
          <Button onClick={handleSaveComments} disabled={saving}>
            {saving ? tc('loading') : tc('save')}
          </Button>
        )}
      </div>

      {/* Snapshot summary */}
      {reportCard.snapshot_payload && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Grade Summary</h3>
          <div className="rounded-xl border border-border bg-surface p-4">
            <pre className="whitespace-pre-wrap text-xs text-text-secondary">
              {JSON.stringify(reportCard.snapshot_payload, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Revision chain */}
      {reportCard.revision_chain && reportCard.revision_chain.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('revisionChain')}</h3>
          <div className="space-y-2">
            {reportCard.revision_chain.map((rev) => (
              <div
                key={rev.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text-primary">v{rev.version}</span>
                  <StatusBadge status={STATUS_VARIANT[rev.status] ?? 'neutral'}>
                    {rev.status}
                  </StatusBadge>
                </div>
                <span className="text-xs font-mono text-text-tertiary" dir="ltr">
                  {new Date(rev.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PdfPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
}
