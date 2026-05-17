'use client';

import { RefreshCw, ShieldCheck } from 'lucide-react';
import * as React from 'react';

import { cn, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { getErrorMessage } from '../synthetic-checks/_components/status-badge';

interface CertificateCheck {
  id: string;
  hostname: string;
  not_before: string | null;
  not_after: string | null;
  issuer: string | null;
  subject: string | null;
  days_until_expiry: number | null;
  check_status: string;
  check_error: string | null;
  last_checked_at: string;
}

export default function PlatformCertificatesPage() {
  const [certificates, setCertificates] = React.useState<CertificateCheck[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadCertificates = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<CertificateCheck[]>('/api/v1/admin/certificates');
      setCertificates(result);
    } catch (err: unknown) {
      console.error('[PlatformCertificatesPage.loadCertificates]', err);
      toast.error(getErrorMessage(err, 'Failed to load certificates.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCertificates();
  }, [loadCertificates]);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Certificate Checks"
          description="TLS expiry and chain status from synthetic certificate checks."
        />
        <button
          type="button"
          onClick={() => void loadCertificates()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-[1.2fr_0.7fr_0.8fr_1fr] gap-3 border-b border-border bg-surface-secondary px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary max-lg:hidden">
          <span>Host</span>
          <span>Status</span>
          <span>Expiry</span>
          <span>Issuer</span>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-sm text-text-secondary">Loading certificates...</div>
        ) : certificates.length === 0 ? (
          <div className="px-4 py-8 text-sm text-text-secondary">No certificate rows recorded.</div>
        ) : (
          certificates.map((certificate) => (
            <article
              key={certificate.id}
              className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 lg:grid-cols-[1.2fr_0.7fr_0.8fr_1fr] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary-700" />
                  <h2 className="truncate text-sm font-semibold text-text-primary">
                    {certificate.hostname}
                  </h2>
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  Checked {new Date(certificate.last_checked_at).toLocaleString()}
                </p>
              </div>
              <CertificateBadge status={certificate.check_status} />
              <div className="text-sm text-text-secondary">
                {certificate.days_until_expiry === null
                  ? 'Unknown'
                  : `${certificate.days_until_expiry} days`}
                {certificate.not_after ? (
                  <p className="mt-1 text-xs text-text-tertiary">
                    {new Date(certificate.not_after).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0 text-sm text-text-secondary">
                <p className="truncate">{certificate.issuer ?? 'Unknown issuer'}</p>
                {certificate.check_error ? (
                  <p className="mt-1 text-xs text-danger-text">{certificate.check_error}</p>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function CertificateBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit rounded-full px-2 py-1 text-xs font-semibold',
        status === 'ok' && 'bg-success-bg text-success-text',
        status === 'expiring_soon' && 'bg-warning-bg text-warning-text',
        status !== 'ok' && status !== 'expiring_soon' && 'bg-danger-bg text-danger-text',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
