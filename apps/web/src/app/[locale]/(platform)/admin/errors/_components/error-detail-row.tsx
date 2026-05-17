'use client';

import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@school/ui';

import { ExplainButton } from '@/components/platform/explain-button';
import { formatDateTime } from '@/lib/format-date';

export interface PlatformErrorLog {
  id: string;
  occurred_at: string;
  source: string;
  level: string;
  error_code: string | null;
  message_redacted: string;
  stack_redacted: string | null;
  endpoint: string | null;
  http_status: number | null;
  fingerprint: string;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  tenant_id_redacted: string | null;
  user_id_redacted: string | null;
  correlation_id: string | null;
  sentry_event_id: string | null;
}

interface ErrorDetailRowProps {
  deployHint?: { short_sha: string; deployed_at: string } | null;
  error: PlatformErrorLog;
  locale: string;
  tenantName?: string;
}

export function ErrorDetailRow({ deployHint, error, locale, tenantName }: ErrorDetailRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const statusTone =
    error.http_status && error.http_status >= 500
      ? 'bg-danger-bg text-danger-text'
      : 'bg-warning-bg text-warning-text';

  return (
    <>
      <tr
        className="cursor-pointer border-b border-border hover:bg-surface-secondary"
        onClick={() => setExpanded((current) => !current)}
      >
        <td className="w-10 px-3 py-3 text-text-tertiary">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-3 py-3 text-xs text-text-secondary" dir="ltr">
          {formatDateTime(error.last_seen_at)}
        </td>
        <td className="px-3 py-3">
          <div className="max-w-52 truncate text-sm font-medium text-text-primary">
            {tenantName ?? 'Platform'}
          </div>
          <div className="mt-1 font-mono text-xs text-text-tertiary">{error.source}</div>
        </td>
        <td className="px-3 py-3">
          <div className="max-w-64 truncate font-mono text-xs text-text-secondary" dir="ltr">
            {error.endpoint ?? 'Unknown endpoint'}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {error.http_status ? <Badge className={statusTone}>{error.http_status}</Badge> : null}
            <Badge className="bg-surface-secondary text-text-secondary">{error.level}</Badge>
            {deployHint ? (
              <Badge className="bg-info-bg text-info-text">
                after deploy {deployHint.short_sha}
              </Badge>
            ) : null}
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="max-w-72 truncate text-sm text-text-primary">
            {error.message_redacted}
          </div>
          <div className="mt-1 font-mono text-xs text-text-tertiary">
            {error.error_code ?? 'INTERNAL_ERROR'}
          </div>
        </td>
        <td className="px-3 py-3 text-sm text-text-secondary">{error.count}</td>
        <td className="px-3 py-3 font-mono text-xs text-text-tertiary" dir="ltr">
          {error.correlation_id ?? 'N/A'}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border bg-surface-secondary">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
              <div className="min-w-0 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-text-tertiary">Full message</p>
                  <p className="mt-1 break-words text-sm text-text-primary">
                    {error.message_redacted}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-tertiary">Stack trace</p>
                  <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-background p-3 text-xs text-text-secondary">
                    {error.stack_redacted ?? 'No stack trace captured.'}
                  </pre>
                </div>
              </div>
              <div className="space-y-3">
                <ExplainButton
                  contextId={error.fingerprint}
                  contextKind="error"
                  label="Explain Error"
                  locale={locale}
                  question={`Explain this error fingerprint ${error.fingerprint}. What nearby deploys, alerts, request context, and cited runbooks are relevant?`}
                />
                <InfoField label="Fingerprint" value={error.fingerprint} />
                <InfoField label="User ID" value={error.user_id_redacted ?? 'N/A'} />
                <InfoField label="First seen" value={formatDateTime(error.first_seen_at)} />
                {error.sentry_event_id ? (
                  <a
                    className="inline-flex items-center text-sm font-medium text-primary-700"
                    href={`https://sentry.io/issues/?query=${encodeURIComponent(
                      error.sentry_event_id,
                    )}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink className="me-2 h-4 w-4" />
                    Open in Sentry
                  </a>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-tertiary">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-text-secondary" dir="ltr">
        {value}
      </p>
    </div>
  );
}
