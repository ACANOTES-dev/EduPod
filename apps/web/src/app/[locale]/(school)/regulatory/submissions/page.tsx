'use client';

import { REGULATORY_DOMAINS } from '@school/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { RegulatoryNav } from '../_components/regulatory-nav';
import { SubmissionHistoryTable } from '../_components/submission-history-table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Submission {
  id: string;
  domain: string;
  submission_type: string;
  academic_year: string;
  period_label: string | null;
  status: string;
  submitted_at: string | null;
  record_count: number | null;
  notes: string | null;
  created_at: string;
}

interface SubmissionsApiResponse {
  data: Submission[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Page Component ───────────────────────────────────────────────────────────

export default function RegulatorySubmissionsPage() {
  const t = useTranslations('regulatory');

  const [submissions, setSubmissions] = React.useState<Submission[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [domain, setDomain] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchSubmissions = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (domain !== 'all') {
        params.set('domain', domain);
      }
      if (status !== 'all') {
        params.set('status', status);
      }

      const response = await apiClient<SubmissionsApiResponse>(
        `/api/v1/regulatory/submissions?${params.toString()}`,
        { silent: true },
      );

      setSubmissions(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch (err) {
      console.error('[RegulatorySubmissionsPage.fetchSubmissions]', err);
      setSubmissions([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, domain, status]);

  React.useEffect(() => {
    void fetchSubmissions();
  }, [fetchSubmissions]);

  // ─── Toolbar ──────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[200px_200px]">
      <Select
        value={domain}
        onValueChange={(value) => {
          setDomain(value);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('submissions.domain')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('submissions.allDomains')}</SelectItem>
          {Object.entries(REGULATORY_DOMAINS).map(([key, val]) => (
            <SelectItem key={key} value={key}>
              {val.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('submissions.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('submissions.allStatuses')}</SelectItem>
          <SelectItem value="not_started">{t('status.notStarted')}</SelectItem>
          <SelectItem value="in_progress">{t('status.inProgress')}</SelectItem>
          <SelectItem value="ready_for_review">{t('status.readyForReview')}</SelectItem>
          <SelectItem value="submitted">{t('status.submitted')}</SelectItem>
          <SelectItem value="accepted">{t('status.accepted')}</SelectItem>
          <SelectItem value="rejected">{t('status.rejected')}</SelectItem>
          <SelectItem value="overdue">{t('status.overdue')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('submissions.title')}
        description={t('submissions.description')}
      />

      <RegulatoryNav />

      <SubmissionHistoryTable
        data={submissions}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        isLoading={isLoading}
        toolbar={toolbar}
      />
    </div>
  );
}
