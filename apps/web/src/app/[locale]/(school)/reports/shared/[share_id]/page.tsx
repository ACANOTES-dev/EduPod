'use client';

import {
  AlertTriangle,
  ChevronLeft,
  Download,
  ExternalLink,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type {
  ReportShareArtifactFormat,
  SharedSnapshotArtifact,
  SharedSnapshotView,
} from '@school/shared/reports';
import { Badge, Button, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

/**
 * Shared snapshot view (impl 19) — read-only page recipients land on when
 * they click the deep-link in their inbox. Re-fetches every render so the
 * S3 signed URLs are fresh (15-minute TTL on the backend). Renders one
 * download button per artifact format that was generated, plus an "Open in
 * builder" affordance for users who hold `reports.builder` and the source
 * report is shared (`can_open_in_builder`).
 */
type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: SharedSnapshotView }
  | { kind: 'expired' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string };

export default function SharedSnapshotPage() {
  const t = useTranslations('reports.shared');
  const params = useParams<{ share_id?: string }>();
  const shareId = params?.share_id ?? '';

  const [state, setState] = React.useState<FetchState>({ kind: 'loading' });

  React.useEffect(() => {
    if (!shareId) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    apiClient<{ data: SharedSnapshotView } | SharedSnapshotView>(
      `/api/v1/reports/shared/${shareId}`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        const view = (res as { data?: SharedSnapshotView }).data ?? (res as SharedSnapshotView);
        setState({ kind: 'ready', data: view });
      })
      .catch((err) => {
        if (cancelled) return;
        const apiErr = err as { code?: string; status?: number; message?: string };
        console.error('[SharedSnapshotPage.load]', err);
        if (apiErr?.code === 'REPORT_SHARE_NOT_FOUND') {
          setState({ kind: 'expired' });
        } else if (
          apiErr?.code === 'REPORT_SHARE_VIEW_FORBIDDEN' ||
          apiErr?.status === 403
        ) {
          setState({ kind: 'forbidden' });
        } else {
          setState({
            kind: 'error',
            message: apiErr?.message ?? t('errorGeneric'),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shareId, t]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <Link
        href="/reports"
        className="inline-flex w-fit items-center gap-1 text-sm text-text-tertiary hover:text-text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('backToReports')}
      </Link>

      {state.kind === 'loading' && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface p-12 text-text-tertiary">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('loading')}
        </div>
      )}

      {state.kind === 'expired' && (
        <ExpiredCard
          title={t('expired.title')}
          description={t('expired.description')}
        />
      )}

      {state.kind === 'forbidden' && (
        <ExpiredCard
          title={t('forbidden.title')}
          description={t('forbidden.description')}
        />
      )}

      {state.kind === 'error' && (
        <ExpiredCard title={t('errorTitle')} description={state.message} />
      )}

      {state.kind === 'ready' && <SnapshotView view={state.data} shareId={shareId} />}
    </div>
  );
}

function ExpiredCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">{title}</p>
          <p className="text-sm">{description}</p>
        </div>
      </div>
    </div>
  );
}

function SnapshotView({ view, shareId }: { view: SharedSnapshotView; shareId: string }) {
  const t = useTranslations('reports.shared');

  return (
    <article className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-text-tertiary">
          {t('snapshotPill')}
        </p>
        <h1 className="text-xl font-semibold text-text-primary">{view.saved_report_name}</h1>
        <p className="text-sm text-text-secondary">
          {t('sharedByOn', {
            name: view.shared_by_name,
            date: formatDate(view.shared_at),
          })}
        </p>
        {view.saved_report_description ? (
          <p className="text-sm text-text-secondary">{view.saved_report_description}</p>
        ) : null}
      </header>

      <FilterSummary text={view.filters_summary} />

      {view.message_body ? (
        <section className="rounded-md border border-border bg-background/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t('messageHeading')}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-text-primary">
            {view.message_body}
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">{t('downloads')}</h2>
        <div className="flex flex-wrap gap-2">
          {view.artifacts.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t('noArtifacts')}</p>
          ) : (
            view.artifacts.map((artifact) => (
              <ArtifactButton key={artifact.format} artifact={artifact} shareId={shareId} />
            ))
          )}
        </div>
      </section>

      <section className="space-y-2 border-t border-border pt-3">
        {view.can_open_in_builder ? (
          <Link
            href={`/reports/builder/${view.saved_report_id}`}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            data-testid="open-in-builder"
          >
            {t('openInBuilder')}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </section>
    </article>
  );
}

function FilterSummary({ text }: { text: string }) {
  const t = useTranslations('reports.shared');
  return (
    <section className="rounded-md border border-border bg-background/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {t('filterSummaryHeading')}
      </p>
      <p className="mt-1 text-sm text-text-primary">{text || t('filterSummaryEmpty')}</p>
    </section>
  );
}

function ArtifactButton({
  artifact,
  shareId,
}: {
  artifact: SharedSnapshotArtifact;
  shareId: string;
}) {
  const t = useTranslations('reports.shared');
  const [downloading, setDownloading] = React.useState(false);

  const onClick = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      // The signed URL is generated by the backend with a 15-minute TTL.
      // We open it directly so the browser handles the file download — no
      // CORS-bound fetch / blob hop required.
      const link = document.createElement('a');
      link.href = artifact.download_url;
      link.target = '_blank';
      link.rel = 'noopener';
      // The filename hint is advisory; the S3 response sets
      // Content-Disposition with the canonical filename.
      link.download = artifact.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('[SnapshotView.download]', err, { shareId });
      toast.error(t('downloadFailed'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={downloading}
      data-testid={`download-${artifact.format}`}
    >
      {downloading ? (
        <Loader2 className="me-2 h-4 w-4 animate-spin" />
      ) : (
        formatIcon(artifact.format)
      )}
      <span>{t(`downloadFormat_${artifact.format}`)}</span>
      <Badge variant="secondary" className="ms-2 text-[10px]">
        {artifact.format.toUpperCase()}
      </Badge>
    </Button>
  );
}

function formatIcon(format: ReportShareArtifactFormat): React.ReactElement {
  switch (format) {
    case 'pdf':
      return <FileText className="me-2 h-4 w-4" />;
    case 'excel':
      return <FileSpreadsheet className="me-2 h-4 w-4" />;
    case 'word':
      return <FileBarChart className="me-2 h-4 w-4" />;
    default:
      return <Download className="me-2 h-4 w-4" />;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
