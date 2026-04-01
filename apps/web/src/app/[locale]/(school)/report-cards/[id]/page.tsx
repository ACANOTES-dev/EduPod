'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  QrCode,
  Send,
  Sparkles,
} from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
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

import { PdfPreviewModal } from '../_components/pdf-preview-modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomFieldDef {
  id: string;
  label: string;
  label_ar: string | null;
  field_type: 'text' | 'select' | 'rating';
  options_json: string[] | null;
  section_type: string;
}

interface CustomFieldValue {
  field_def_id: string;
  value: string;
}

interface ApprovalStep {
  step_order: number;
  step_label: string;
  status: 'pending' | 'approved' | 'rejected';
  actioned_by_name: string | null;
  actioned_at: string | null;
  rejection_reason: string | null;
}

interface AcknowledgmentInfo {
  acknowledged: boolean;
  acknowledged_at: string | null;
  parent_name: string | null;
}

interface VerificationToken {
  token: string;
}

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
  approval_steps: ApprovalStep[];
  custom_field_values: CustomFieldValue[];
  acknowledgments: AcknowledgmentInfo[];
  verification_token: VerificationToken | null;
}

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'neutral'> = {
  draft: 'warning',
  published: 'success',
  revised: 'neutral',
};

const APPROVAL_STATUS_VARIANT: Record<string, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
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
  const [generatingTeacher, setGeneratingTeacher] = React.useState(false);
  const [generatingPrincipal, setGeneratingPrincipal] = React.useState(false);
  const [delivering, setDelivering] = React.useState(false);

  const [teacherComment, setTeacherComment] = React.useState('');
  const [principalComment, setPrincipalComment] = React.useState('');
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [customFieldDefs, setCustomFieldDefs] = React.useState<CustomFieldDef[]>([]);
  const [customValues, setCustomValues] = React.useState<Record<string, string>>({});

  const fetchReportCard = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [rcRes, defsRes] = await Promise.all([
        apiClient<{ data: ReportCardDetail }>(`/api/v1/report-cards/${id}`),
        apiClient<{ data: CustomFieldDef[] }>('/api/v1/report-card-custom-field-defs').catch(
          () => ({ data: [] }),
        ),
      ]);
      setReportCard(rcRes.data);
      setTeacherComment(rcRes.data.teacher_comment ?? '');
      setPrincipalComment(rcRes.data.principal_comment ?? '');
      setCustomFieldDefs(defsRes.data);
      // Build initial custom values map
      const valMap: Record<string, string> = {};
      for (const cv of rcRes.data.custom_field_values) {
        valMap[cv.field_def_id] = cv.value;
      }
      setCustomValues(valMap);
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
          custom_field_values: Object.entries(customValues).map(([field_def_id, value]) => ({
            field_def_id,
            value,
          })),
        }),
      });
      toast.success(tc('saved'));
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

  const handleSubmitForApproval = async () => {
    try {
      await apiClient(`/api/v1/report-cards/${id}/submit-approval`, { method: 'POST' });
      toast.success(t('submittedForApproval'));
      void fetchReportCard();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handleDeliver = async () => {
    setDelivering(true);
    try {
      await apiClient(`/api/v1/report-cards/${id}/deliver`, { method: 'POST' });
      toast.success(t('deliveredToParents'));
      void fetchReportCard();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setDelivering(false);
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

  const handleGenerateAiComment = async (commentType: 'teacher' | 'principal') => {
    const setGenerating = commentType === 'teacher' ? setGeneratingTeacher : setGeneratingPrincipal;
    const setter = commentType === 'teacher' ? setTeacherComment : setPrincipalComment;
    setGenerating(true);
    try {
      const res = await apiClient<{ data: { comment: string } }>(
        `/api/v1/report-cards/${id}/ai-comment`,
        { method: 'POST', body: JSON.stringify({ comment_type: commentType }) },
      );
      setter(res.data.comment);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setGenerating(false);
    }
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
    return <div className="py-12 text-center text-text-tertiary">{t('notFound')}</div>;
  }

  const isDraft = reportCard.status === 'draft';
  const isPublished = reportCard.status === 'published';

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/report-cards`)}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <PageHeader
          title={t('title')}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handlePreview}>
                <FileText className="me-2 h-4 w-4" />
                {t('preview')}
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="me-2 h-4 w-4" />
                {t('download')}
              </Button>
              {isDraft && (
                <>
                  <Button variant="outline" onClick={() => void handleSubmitForApproval()}>
                    {t('submitForApproval')}
                  </Button>
                  <Button onClick={() => void handlePublish()}>{t('publish')}</Button>
                </>
              )}
              {isPublished && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => void handleDeliver()}
                    disabled={delivering}
                  >
                    {delivering ? (
                      <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="me-2 h-4 w-4" />
                    )}
                    {t('deliverToParents')}
                  </Button>
                  <Button variant="outline" onClick={() => void handleRevise()}>
                    {t('revise')}
                  </Button>
                </>
              )}
            </div>
          }
        />
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase text-text-tertiary">{t('student')}</p>
            <p className="mt-1 text-sm font-medium text-text-primary">{reportCard.student_name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-text-tertiary">{t('period')}</p>
            <p className="mt-1 text-sm text-text-primary">{reportCard.academic_period_name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-text-tertiary">{t('status')}</p>
            <div className="mt-1">
              <StatusBadge status={STATUS_VARIANT[reportCard.status] ?? 'neutral'} dot>
                {t(
                  `status${reportCard.status.charAt(0).toUpperCase() + reportCard.status.slice(1)}` as
                    | 'statusDraft'
                    | 'statusPublished'
                    | 'statusRevised',
                )}
              </StatusBadge>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-text-tertiary">{t('locale')}</p>
            <p className="mt-1 font-mono text-sm uppercase text-text-primary" dir="ltr">
              {reportCard.locale}
            </p>
          </div>
        </div>
      </div>

      {/* Approval timeline */}
      {reportCard.approval_steps.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('approvalTimeline')}</h3>
          <div className="relative space-y-0">
            {reportCard.approval_steps.map((step, idx) => (
              <div key={step.step_order} className="flex gap-4">
                {/* Line + dot */}
                <div className="flex flex-col items-center">
                  <div
                    className={`mt-1 h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center ${
                      step.status === 'approved'
                        ? 'border-success-500 bg-success-50'
                        : step.status === 'rejected'
                          ? 'border-error-500 bg-error-50'
                          : 'border-border bg-surface-secondary'
                    }`}
                  >
                    {step.status === 'approved' && (
                      <CheckCircle2 className="h-3 w-3 text-success-600" />
                    )}
                    {step.status === 'rejected' && (
                      <span className="text-xs text-error-600">✕</span>
                    )}
                    {step.status === 'pending' && (
                      <span className="text-xs text-text-tertiary">{step.step_order}</span>
                    )}
                  </div>
                  {idx < reportCard.approval_steps.length - 1 && (
                    <div className="w-px flex-1 bg-border my-1" />
                  )}
                </div>
                {/* Content */}
                <div className="pb-4 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{step.step_label}</span>
                    <StatusBadge status={APPROVAL_STATUS_VARIANT[step.status] ?? 'neutral'} dot>
                      {t(`approvalStatus_${step.status}`)}
                    </StatusBadge>
                  </div>
                  {step.actioned_by_name && (
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      {step.actioned_by_name}
                      {step.actioned_at && (
                        <span className="ms-2 font-mono" dir="ltr">
                          {new Date(step.actioned_at).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  )}
                  {step.rejection_reason && (
                    <p className="mt-1 rounded-lg bg-error-50 px-3 py-1.5 text-xs text-error-700">
                      {step.rejection_reason}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="teacher-comment">{t('teacherComment')}</Label>
            {isDraft && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleGenerateAiComment('teacher')}
                disabled={generatingTeacher}
              >
                {generatingTeacher ? (
                  <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="me-2 h-3.5 w-3.5" />
                )}
                {t('aiGenerateComment')}
              </Button>
            )}
          </div>
          <Textarea
            id="teacher-comment"
            value={teacherComment}
            onChange={(e) => setTeacherComment(e.target.value)}
            disabled={!isDraft || generatingTeacher}
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="principal-comment">{t('principalComment')}</Label>
            {isDraft && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleGenerateAiComment('principal')}
                disabled={generatingPrincipal}
              >
                {generatingPrincipal ? (
                  <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="me-2 h-3.5 w-3.5" />
                )}
                {t('aiGenerateComment')}
              </Button>
            )}
          </div>
          <Textarea
            id="principal-comment"
            value={principalComment}
            onChange={(e) => setPrincipalComment(e.target.value)}
            disabled={!isDraft || generatingPrincipal}
            rows={3}
          />
        </div>

        {/* Custom fields */}
        {customFieldDefs.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">{t('customFieldsTitle')}</h3>
            {customFieldDefs.map((def) => (
              <CustomFieldInput
                key={def.id}
                def={def}
                value={customValues[def.id] ?? ''}
                onChange={(v) => setCustomValues((prev) => ({ ...prev, [def.id]: v }))}
                disabled={!isDraft}
              />
            ))}
          </div>
        )}

        {isDraft && (
          <Button onClick={() => void handleSaveComments()} disabled={saving}>
            {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            {tc('save')}
          </Button>
        )}
      </div>

      {/* Snapshot summary */}
      {reportCard.snapshot_payload && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('gradeSummary')}</h3>
          <div className="rounded-xl border border-border bg-surface p-4">
            <pre className="whitespace-pre-wrap text-xs text-text-secondary">
              {JSON.stringify(reportCard.snapshot_payload, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Acknowledgment status */}
      {reportCard.acknowledgments.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('acknowledgments')}</h3>
          <div className="space-y-2">
            {reportCard.acknowledgments.map((ack, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {ack.parent_name ?? t('parent')}
                  </p>
                </div>
                {ack.acknowledged ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success-600" />
                    <span className="text-xs font-mono text-text-tertiary" dir="ltr">
                      {ack.acknowledged_at
                        ? new Date(ack.acknowledged_at).toLocaleDateString()
                        : ''}
                    </span>
                  </div>
                ) : (
                  <StatusBadge status="warning" dot>
                    {t('notAcknowledged')}
                  </StatusBadge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QR verification */}
      {reportCard.verification_token && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('qrVerification')}</h3>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
            <QrCode className="h-8 w-8 shrink-0 text-text-tertiary" />
            <div className="min-w-0">
              <p className="text-sm text-text-secondary">{t('qrVerificationDesc')}</p>
              <p className="mt-1 truncate font-mono text-xs text-text-tertiary" dir="ltr">
                {`/verify/${reportCard.verification_token.token}`}
              </p>
            </div>
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
                <span className="font-mono text-xs text-text-tertiary" dir="ltr">
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

// ─── Custom Field Input ───────────────────────────────────────────────────────

function CustomFieldInput({
  def,
  value,
  onChange,
  disabled,
}: {
  def: CustomFieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const label = def.label;

  if (def.field_type === 'select' && def.options_json) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {def.options_json.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (def.field_type === 'rating') {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(String(n))}
              className={`h-9 w-9 rounded-lg border text-sm font-medium transition-colors ${
                value === String(n)
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
              } disabled:opacity-50`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="—"
      />
    </div>
  );
}
