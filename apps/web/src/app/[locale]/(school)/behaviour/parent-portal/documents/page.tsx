'use client';

import { Download, FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

interface ParentDocument {
  id: string;
  student_id: string;
  student_name: string;
  document_type: string;
  entity_type: string;
  entity_id: string;
  generated_at: string;
  sent_at: string | null;
  file_size_bytes: number;
}

const DOCUMENT_TYPE_KEY: Record<string, string> = {
  incident_notice: 'typeIncidentNotice',
  sanction_letter: 'typeSanctionLetter',
  appeal_response: 'typeAppealResponse',
  behaviour_report: 'typeBehaviourReport',
};

export default function ParentDocumentsPage() {
  const t = useTranslations('parentDocuments');
  const locale = useLocale();

  const [items, setItems] = React.useState<ParentDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data: ParentDocument[] }>('/api/v1/parent/behaviour/documents?pageSize=50', {
      silent: true,
    })
      .then((res) => setItems(res.data ?? []))
      .catch((err) => {
        console.error('[ParentDocumentsPage]', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/behaviour/parent-portal`, label: t('backToPortal') }}
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-5 text-center">
          <p className="text-sm text-text-primary">{t('errorLoading')}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-text-tertiary/30" aria-hidden="true" />
          <p className="mt-3 text-sm text-text-primary">{t('empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((doc) => {
            const typeLabel = DOCUMENT_TYPE_KEY[doc.document_type]
              ? t(DOCUMENT_TYPE_KEY[doc.document_type] as never)
              : doc.document_type.replace(/_/g, ' ');
            return (
              <li
                key={doc.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <FileText
                      className="mt-0.5 h-5 w-5 shrink-0 text-text-tertiary"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {doc.student_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {typeLabel}
                        </Badge>
                        <span className="text-xs text-text-tertiary">
                          {formatDate(doc.generated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(`/api/v1/behaviour/documents/${doc.id}/file`, '_blank')
                    }
                  >
                    <Download className="me-1 h-4 w-4" aria-hidden="true" />
                    {t('download')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
