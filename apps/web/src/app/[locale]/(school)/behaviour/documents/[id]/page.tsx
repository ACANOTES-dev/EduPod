'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

import { DocumentStatusBadge } from '../_components/document-status-badge';
import type { DocumentRow } from '../_components/document-types';
import { SendDocumentDialog } from '../_components/send-document-dialog';

// ─── Constants ────────────────────────────────────────────────────────────────

// Polling cadence for `generating` documents. 30 × 2000ms = 60s max — after
// that we surface a manual Refresh button so the user isn't left watching a
// spinner if the pdf render job is stuck (impl 06 explicitly did not ship a
// `generation_failed` state, so we cannot detect true failure — only timeout).
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30;

export default function BehaviourDocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const documentId = params?.id ?? '';

  const t = useTranslations('documentGen.detail');
  const tTypes = useTranslations('documentGen.types');
  const tEntities = useTranslations('documentGen.entityTypes');

  const [doc, setDoc] = React.useState<DocumentRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const [finaliseOpen, setFinaliseOpen] = React.useState(false);
  const [finaliseNotes, setFinaliseNotes] = React.useState('');
  const [finaliseSubmitting, setFinaliseSubmitting] = React.useState(false);

  const [sendOpen, setSendOpen] = React.useState(false);

  const [pollAttempt, setPollAttempt] = React.useState(0);
  const [pollExhausted, setPollExhausted] = React.useState(false);

  const fetchDoc = React.useCallback(async (): Promise<DocumentRow | null> => {
    try {
      const res = await apiClient<{ data: DocumentRow }>(
        `/api/v1/behaviour/documents/${documentId}`,
        { silent: true },
      );
      setDoc(res.data);
      setLoadError(null);
      return res.data;
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      console.error('[BehaviourDocumentDetailPage.fetchDoc]', err);
      setLoadError(ex?.error?.message ?? ex?.message ?? t('errorLoad'));
      return null;
    }
  }, [documentId, t]);

  // Initial load.
  React.useEffect(() => {
    let cancelled = false;
    if (!documentId) return;
    setLoading(true);
    void fetchDoc().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, fetchDoc]);

  // Polling while in `generating`. Capped at POLL_MAX_ATTEMPTS.
  React.useEffect(() => {
    if (!doc || doc.status !== 'generating' || pollExhausted) return;
    if (pollAttempt >= POLL_MAX_ATTEMPTS) {
      setPollExhausted(true);
      return;
    }
    const handle = setTimeout(() => {
      void fetchDoc().then((next) => {
        setPollAttempt((prev) => prev + 1);
        if (next && next.status !== 'generating') {
          setPollAttempt(0);
          setPollExhausted(false);
        }
      });
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(handle);
  }, [doc, pollAttempt, pollExhausted, fetchDoc]);

  // Signed preview URL — refreshed whenever the document becomes preview-able.
  // The backend 1h presign is generous, but we refresh on each revisit anyway
  // to avoid serving a stale URL in a long-lived tab.
  React.useEffect(() => {
    if (!doc) return;
    if (doc.status === 'generating') {
      setPreviewUrl(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    apiClient<{ data: { url: string } }>(`/api/v1/behaviour/documents/${doc.id}/preview`, {
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        setPreviewUrl(res.data?.url ?? null);
        setPreviewError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const ex = err as { error?: { message?: string } };
        console.error('[BehaviourDocumentDetailPage.preview]', err);
        setPreviewError(ex?.error?.message ?? t('previewError'));
        setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, t]);

  const refresh = () => {
    setPollAttempt(0);
    setPollExhausted(false);
    void fetchDoc();
  };

  const handleFinalise = async () => {
    if (!doc) return;
    setFinaliseSubmitting(true);
    try {
      const res = await apiClient<{ data: DocumentRow }>(
        `/api/v1/behaviour/documents/${doc.id}/finalise`,
        {
          method: 'PATCH',
          body: JSON.stringify({ notes: finaliseNotes.trim() || undefined }),
          silent: true,
        },
      );
      setDoc(res.data);
      setFinaliseOpen(false);
      setFinaliseNotes('');
      toast.success(t('finaliseSuccess'));
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      toast.error(ex?.error?.message ?? t('finaliseError'));
    } finally {
      setFinaliseSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!doc) return;
    try {
      const res = await apiClient<{ data: { url: string } }>(
        `/api/v1/behaviour/documents/${doc.id}/download`,
        { silent: true },
      );
      if (res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      toast.error(ex?.error?.message ?? t('downloadError'));
    }
  };

  const goBack = () => {
    router.push(`/${locale}/behaviour/documents`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-surface-secondary" />
        <div className="h-96 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (loadError || !doc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" />
          {t('back')}
        </Button>
        <div className="rounded-xl border border-danger-border bg-danger-surface p-6">
          <h2 className="text-base font-semibold text-danger-text">{t('errorTitle')}</h2>
          <p className="mt-1 text-sm text-danger-text">{loadError ?? t('errorLoad')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            <RefreshCw className="me-1 h-4 w-4" />
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  const studentName = doc.student
    ? `${doc.student.first_name} ${doc.student.last_name}`
    : t('noStudent');
  const generatedByName = doc.generated_by
    ? `${doc.generated_by.first_name} ${doc.generated_by.last_name}`
    : t('unknownAuthor');

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={goBack}>
        <ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" />
        {t('back')}
      </Button>

      <PageHeader
        title={tTypes(doc.document_type)}
        description={t('subtitle', { student: studentName })}
        actions={<DocumentStatusBadge status={doc.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <PreviewPanel
          status={doc.status}
          previewUrl={previewUrl}
          previewError={previewError}
          pollAttempt={pollAttempt}
          pollExhausted={pollExhausted}
          onRefresh={refresh}
        />

        <aside className="space-y-5">
          <MetadataCard
            doc={doc}
            studentName={studentName}
            generatedByName={generatedByName}
            entityLabel={tEntities(doc.entity_type)}
          />

          <ActionsCard
            status={doc.status}
            onFinalise={() => setFinaliseOpen(true)}
            onSend={() => setSendOpen(true)}
            onDownload={() => {
              void handleDownload();
            }}
            onOpenPreview={() => {
              if (previewUrl) {
                window.open(previewUrl, '_blank', 'noopener,noreferrer');
              }
            }}
            previewAvailable={!!previewUrl}
          />
        </aside>
      </div>

      <SendDocumentDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        document={doc}
        onSent={(next) => setDoc(next)}
      />

      {finaliseOpen && (
        <FinaliseDialog
          notes={finaliseNotes}
          onNotesChange={setFinaliseNotes}
          onCancel={() => {
            setFinaliseOpen(false);
            setFinaliseNotes('');
          }}
          onConfirm={() => {
            void handleFinalise();
          }}
          submitting={finaliseSubmitting}
        />
      )}
    </div>
  );
}

// ─── Preview panel ────────────────────────────────────────────────────────────

interface PreviewPanelProps {
  status: DocumentRow['status'];
  previewUrl: string | null;
  previewError: string | null;
  pollAttempt: number;
  pollExhausted: boolean;
  onRefresh: () => void;
}

function PreviewPanel({
  status,
  previewUrl,
  previewError,
  pollAttempt,
  pollExhausted,
  onRefresh,
}: PreviewPanelProps) {
  const t = useTranslations('documentGen.detail');

  if (status === 'generating') {
    return (
      <div className="flex min-h-[480px] flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface p-8 text-center">
        {pollExhausted ? (
          <>
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <div>
              <h3 className="text-base font-semibold text-text-primary">{t('pollTimeoutTitle')}</h3>
              <p className="mt-1 max-w-md text-sm text-text-secondary">{t('pollTimeoutBody')}</p>
            </div>
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw className="me-1 h-4 w-4" />
              {t('refreshNow')}
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <div>
              <h3 className="text-base font-semibold text-text-primary">{t('generatingTitle')}</h3>
              <p className="mt-1 text-sm text-text-secondary">
                {t('generatingBody', { attempt: pollAttempt + 1, total: POLL_MAX_ATTEMPTS })}
              </p>
            </div>
          </>
        )}
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface p-8 text-center">
        <XCircle className="h-8 w-8 text-danger-text" />
        <p className="text-sm text-danger-text">{previewError}</p>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="me-1 h-4 w-4" />
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="flex min-h-[480px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-text-tertiary">
        {t('previewUnavailable')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <iframe
        src={previewUrl}
        title="document-preview"
        className="h-[70vh] min-h-[480px] w-full"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    </div>
  );
}

// ─── Metadata card ────────────────────────────────────────────────────────────

interface MetadataCardProps {
  doc: DocumentRow;
  studentName: string;
  generatedByName: string;
  entityLabel: string;
}

function MetadataCard({ doc, studentName, generatedByName, entityLabel }: MetadataCardProps) {
  const t = useTranslations('documentGen.detail');
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-text-primary">{t('metadataTitle')}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <MetaRow label={t('labelStudent')} value={studentName} />
        <MetaRow label={t('labelEntity')} value={entityLabel} />
        <MetaRow label={t('labelEntityId')} value={doc.entity_id} mono />
        <MetaRow label={t('labelTemplate')} value={doc.template?.name ?? t('labelNoTemplate')} />
        <MetaRow label={t('labelLocale')} value={doc.locale.toUpperCase()} mono />
        <MetaRow label={t('labelGenerated')} value={formatDateTime(doc.generated_at)} />
        <MetaRow label={t('labelGeneratedBy')} value={generatedByName} />
        {doc.sent_at && <MetaRow label={t('labelSent')} value={formatDateTime(doc.sent_at)} />}
        {doc.sent_via && <MetaRow label={t('labelSentVia')} value={doc.sent_via} />}
      </dl>
    </div>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </dt>
      <dd className={`text-end text-sm text-text-primary ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

// ─── Actions card ─────────────────────────────────────────────────────────────

interface ActionsCardProps {
  status: DocumentRow['status'];
  onFinalise: () => void;
  onSend: () => void;
  onDownload: () => void;
  onOpenPreview: () => void;
  previewAvailable: boolean;
}

function ActionsCard({
  status,
  onFinalise,
  onSend,
  onDownload,
  onOpenPreview,
  previewAvailable,
}: ActionsCardProps) {
  const t = useTranslations('documentGen.detail');
  const tActions = useTranslations('documentGen.actions');
  const canPreview = status !== 'generating' && previewAvailable;
  const canFinalise = status === 'draft';
  const canSend = status === 'finalised';
  const canResend = status === 'sent';

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-text-primary">{t('actionsTitle')}</h3>
      <div className="mt-3 space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          disabled={!canPreview}
          onClick={onOpenPreview}
        >
          <FileText className="me-2 h-4 w-4" />
          {tActions('openInTab')}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          disabled={status === 'generating'}
          onClick={onDownload}
        >
          <Download className="me-2 h-4 w-4" />
          {tActions('download')}
        </Button>
        {canFinalise && (
          <Button className="w-full justify-start" onClick={onFinalise}>
            <CheckCircle2 className="me-2 h-4 w-4" />
            {tActions('finalise')}
          </Button>
        )}
        {canSend && (
          <Button className="w-full justify-start" onClick={onSend}>
            <Send className="me-2 h-4 w-4" />
            {tActions('send')}
          </Button>
        )}
        {canResend && (
          <Button variant="outline" className="w-full justify-start" onClick={onSend}>
            <Send className="me-2 h-4 w-4" />
            {tActions('resend')}
          </Button>
        )}
      </div>

      {status === 'superseded' && (
        <p className="mt-3 rounded-md bg-surface-secondary p-2 text-xs text-text-tertiary">
          {tActions('supersededHint')}
        </p>
      )}
    </div>
  );
}

// ─── Finalise dialog (minimal inline dialog) ──────────────────────────────────

interface FinaliseDialogProps {
  notes: string;
  onNotesChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

function FinaliseDialog({
  notes,
  onNotesChange,
  onCancel,
  onConfirm,
  submitting,
}: FinaliseDialogProps) {
  const t = useTranslations('documentGen.detail.finaliseDialog');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
        <h3 className="text-base font-semibold text-text-primary">{t('title')}</h3>
        <p className="mt-1 text-sm text-text-secondary">{t('description')}</p>
        <Textarea
          className="mt-3"
          placeholder={t('notesPlaceholder')}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          maxLength={1000}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="me-1 h-4 w-4 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              t('confirm')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
