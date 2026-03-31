'use client';

import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  CONSENT_TYPE_OPTIONS,
  FORM_TYPE_OPTIONS,
  formatDisplayDate,
  humanizeStatus,
  type ConsentRecordRow,
  type PaginatedResponse,
  type StudentOption,
} from '../_components/engagement-types';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


export default function ConsentArchivePage() {
  const t = useTranslations('engagement');
  const locale = React.useMemo(
    () => (typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en'),
    [],
  );
  const [page, setPage] = React.useState(1);
  const [records, setRecords] = React.useState<ConsentRecordRow[]>([]);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [studentFilter, setStudentFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [formTypeFilter, setFormTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const fetchData = React.useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
      });

      if (studentFilter !== 'all') params.set('student_id', studentFilter);
      if (typeFilter !== 'all') params.set('consent_type', typeFilter);
      if (formTypeFilter !== 'all') params.set('form_type', formTypeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const [recordsResponse, studentsResponse] = await Promise.all([
        apiClient<PaginatedResponse<ConsentRecordRow>>(
          `/api/v1/engagement/consent-records?${params.toString()}`,
        ),
        apiClient<PaginatedResponse<StudentOption>>('/api/v1/students?page=1&pageSize=100'),
      ]);

      setRecords(recordsResponse.data);
      setTotal(recordsResponse.meta.total);
      setStudents(studentsResponse.data);
    } catch (error) {
      console.error('[ConsentArchivePage.fetchData]', error);
      setRecords([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, formTypeFilter, page, statusFilter, studentFilter, typeFilter]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  React.useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, formTypeFilter, statusFilter, studentFilter, typeFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.consentArchive.title')}
        description={t('pages.consentArchive.description')}
      />

      <DataTable
        columns={[
          {
            key: 'student',
            header: t('pages.consentArchive.columns.student'),
            render: (row) =>
              row.student ? `${row.student.first_name} ${row.student.last_name}` : '—',
          },
          {
            key: 'form',
            header: t('pages.consentArchive.columns.form'),
            render: (row) => row.form_template?.name ?? '—',
          },
          {
            key: 'type',
            header: t('pages.consentArchive.columns.type'),
            render: (row) =>
              t(
                `consentTypes.${
                  CONSENT_TYPE_OPTIONS.find((option) => option.value === row.consent_type)?.label ??
                  'oneTime'
                }`,
              ),
          },
          {
            key: 'status',
            header: t('pages.consentArchive.columns.status'),
            render: (row) => humanizeStatus(row.status),
          },
          {
            key: 'granted',
            header: t('pages.consentArchive.columns.grantedAt'),
            render: (row) => formatDisplayDate(row.granted_at, locale),
          },
          {
            key: 'expiry',
            header: t('pages.consentArchive.columns.expiry'),
            render: (row) => formatDisplayDate(row.expires_at, locale),
          },
        ]}
        data={records}
        page={page}
        pageSize={20}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        toolbar={
          <div className="grid gap-3 lg:grid-cols-3">
            <Select value={studentFilter} onValueChange={setStudentFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('shared.allStudents')}</SelectItem>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.first_name} {student.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('shared.allTypes')}</SelectItem>
                {CONSENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(`consentTypes.${option.label}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={formTypeFilter} onValueChange={setFormTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('shared.allFormTypes')}</SelectItem>
                {FORM_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(`formTypes.${option.label}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('shared.allStatuses')}</SelectItem>
                <SelectItem value="active">{t('statuses.active')}</SelectItem>
                <SelectItem value="expired">{t('statuses.expired')}</SelectItem>
                <SelectItem value="revoked">{t('statuses.revoked')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
        }
      />
    </div>
  );
}
