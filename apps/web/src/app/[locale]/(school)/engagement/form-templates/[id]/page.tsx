'use client';

import { Archive, SendHorizonal } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { CompletionDashboard } from '../../_components/completion-dashboard';
import {
  formatDisplayDateTime,
  humanizeStatus,
  type FormSubmissionRecord,
  type FormTemplateRecord,
  type PaginatedResponse,
  type StudentOption,
  type YearGroupOption,
  type ClassOption,
} from '../../_components/engagement-types';
import { FormTemplateEditor } from '../../_components/form-template-editor';



export default function EngagementFormTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [template, setTemplate] = React.useState<FormTemplateRecord | null>(null);
  const [submissions, setSubmissions] = React.useState<FormSubmissionRecord[]>([]);
  const [stats, setStats] = React.useState<{
    submitted: number;
    pending: number;
    expired: number;
    total: number;
  } | null>(null);
  const [yearGroups, setYearGroups] = React.useState<YearGroupOption[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [distributionBusy, setDistributionBusy] = React.useState(false);
  const [targetType, setTargetType] = React.useState<
    'whole_school' | 'year_group' | 'class_group' | 'custom'
  >('whole_school');
  const [targetIds, setTargetIds] = React.useState<string[]>([]);
  const [deadline, setDeadline] = React.useState('');

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [
        templateResponse,
        submissionsResponse,
        statsResponse,
        yearGroupsResponse,
        classesResponse,
        studentsResponse,
      ] = await Promise.all([
        apiClient<FormTemplateRecord>(`/api/v1/engagement/form-templates/${id}`),
        apiClient<PaginatedResponse<FormSubmissionRecord>>(
          `/api/v1/engagement/form-submissions?page=1&pageSize=20&form_template_id=${id}`,
        ),
        apiClient<{ submitted: number; pending: number; expired: number; total: number }>(
          `/api/v1/engagement/form-submissions/stats?form_template_id=${id}`,
        ),
        apiClient<YearGroupOption[]>('/api/v1/year-groups'),
        apiClient<PaginatedResponse<ClassOption>>('/api/v1/classes?page=1&pageSize=100'),
        apiClient<PaginatedResponse<StudentOption>>('/api/v1/students?page=1&pageSize=100'),
      ]);

      setTemplate(templateResponse);
      setSubmissions(submissionsResponse.data);
      setStats(statsResponse);
      setYearGroups(yearGroupsResponse);
      setClasses(classesResponse.data);
      setStudents(studentsResponse.data);
    } catch (error) {
      console.error('[EngagementFormTemplateDetailPage.loadData]', error);
      toast.error(t('pages.formTemplateDetail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedOptions =
    targetType === 'year_group'
      ? yearGroups.map((item) => ({ id: item.id, label: item.name }))
      : targetType === 'class_group'
        ? classes.map((item) => ({ id: item.id, label: item.name }))
        : students.map((item) => ({
            id: item.id,
            label: `${item.first_name} ${item.last_name}`,
          }));

  async function handleDistribute() {
    if (!template) {
      return;
    }

    setDistributionBusy(true);
    try {
      await apiClient(`/api/v1/engagement/form-templates/${template.id}/distribute`, {
        method: 'POST',
        body: JSON.stringify({
          target_type: targetType,
          target_ids: targetType === 'whole_school' ? undefined : targetIds,
          deadline: deadline || undefined,
        }),
      });
      toast.success(t('pages.formTemplateDetail.distributeSuccess'));
      setTargetIds([]);
      setDeadline('');
    } catch (error) {
      console.error('[EngagementFormTemplateDetailPage.handleDistribute]', error);
      toast.error(t('pages.formTemplateDetail.distributeError'));
    } finally {
      setDistributionBusy(false);
    }
  }

  async function handleArchive() {
    if (!template) {
      return;
    }

    try {
      await apiClient(`/api/v1/engagement/form-templates/${template.id}/archive`, {
        method: 'POST',
      });
      toast.success(t('pages.formTemplateDetail.archiveSuccess'));
      await loadData();
    } catch (error) {
      console.error('[EngagementFormTemplateDetailPage.handleArchive]', error);
      toast.error(t('pages.formTemplateDetail.archiveError'));
    }
  }

  if (loading || !template) {
    return <div className="h-64 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  if (template.status === 'draft') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={template.name}
          description={t('pages.formTemplateDetail.draftDescription')}
        />
        <FormTemplateEditor mode="edit" template={template} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={template.name}
        description={template.description ?? t('pages.formTemplateDetail.defaultDescription')}
        actions={
          template.status === 'published' ? (
            <Button variant="outline" onClick={handleArchive}>
              <Archive className="me-2 h-4 w-4" />
              {t('pages.formTemplateDetail.archive')}
            </Button>
          ) : undefined
        }
      />

      {stats ? (
        <CompletionDashboard
          consentGranted={stats.submitted}
          consentTotal={stats.total}
          paymentPaid={stats.total - stats.pending}
          paymentTotal={stats.total}
          registered={stats.submitted}
          invited={stats.total}
        />
      ) : null}

      {template.status === 'published' ? (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t('pages.formTemplateDetail.distributeTitle')}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {t('pages.formTemplateDetail.distributeDescription')}
              </p>
            </div>
            <Button disabled={distributionBusy} onClick={handleDistribute}>
              <SendHorizonal className="me-2 h-4 w-4" />
              {distributionBusy
                ? t('pages.formTemplateDetail.distributing')
                : t('pages.formTemplateDetail.distribute')}
            </Button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <Select
              value={targetType}
              onValueChange={(value) => setTargetType(value as typeof targetType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whole_school">{t('targetTypes.wholeSchool')}</SelectItem>
                <SelectItem value="year_group">{t('targetTypes.yearGroups')}</SelectItem>
                <SelectItem value="class_group">{t('targetTypes.classes')}</SelectItem>
                <SelectItem value="custom">{t('targetTypes.custom')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </div>

          {targetType !== 'whole_school' ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selectedOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    setTargetIds((current) =>
                      current.includes(option.id)
                        ? current.filter((entry) => entry !== option.id)
                        : [...current, option.id],
                    )
                  }
                  className={`rounded-2xl border px-4 py-3 text-start transition-colors ${
                    targetIds.includes(option.id)
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-border bg-surface-secondary/60'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <DataTable
        columns={[
          {
            key: 'student',
            header: t('pages.formTemplateDetail.columns.student'),
            render: (row) =>
              row.student ? `${row.student.first_name} ${row.student.last_name}` : '—',
          },
          {
            key: 'status',
            header: t('pages.formTemplateDetail.columns.status'),
            render: (row) => humanizeStatus(row.status),
          },
          {
            key: 'submitted',
            header: t('pages.formTemplateDetail.columns.submittedAt'),
            render: (row) => formatDisplayDateTime(row.submitted_at, locale),
          },
          {
            key: 'acknowledged',
            header: t('pages.formTemplateDetail.columns.acknowledgedAt'),
            render: (row) => formatDisplayDateTime(row.acknowledged_at, locale),
          },
        ]}
        data={submissions}
        page={1}
        pageSize={20}
        total={submissions.length}
        onPageChange={() => undefined}
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
