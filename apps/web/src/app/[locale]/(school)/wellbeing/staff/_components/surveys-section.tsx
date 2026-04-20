'use client';

import { ClipboardList, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { SurveyConfirmDialog } from '../../surveys/_components/survey-confirm-dialog';
import { SurveyFormDialog } from '../../surveys/_components/survey-form-dialog';
import { SurveyList } from '../../surveys/_components/survey-list';
import { DEFAULT_FORM, PAGE_SIZE } from '../../surveys/_components/survey-types';
import type {
  Survey,
  SurveyFormState,
  SurveyListResponse,
  SurveyStatus,
} from '../../surveys/_components/survey-types';

import { SectionHeader } from './section-header';

export function SurveysSection() {
  const t = useTranslations('wellbeing.surveys');
  const tStaff = useTranslations('wellbeingStaff');

  const [surveys, setSurveys] = React.useState<Survey[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<SurveyStatus | 'all'>('all');

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingSurveyId, setEditingSurveyId] = React.useState<string | null>(null);
  const [initialForm, setInitialForm] = React.useState<SurveyFormState>({ ...DEFAULT_FORM });

  const [confirmAction, setConfirmAction] = React.useState<{
    type: 'activate' | 'close';
    surveyId: string;
  } | null>(null);

  const fetchSurveys = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiClient<SurveyListResponse>(
        `/api/v1/staff-wellbeing/surveys?page=${page}&pageSize=${PAGE_SIZE}&sortBy=created_at&sortOrder=desc`,
      );
      setSurveys(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      console.error('[SurveysSection]', err);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  React.useEffect(() => {
    void fetchSurveys();
  }, [fetchSurveys]);

  const filteredSurveys = React.useMemo(() => {
    if (statusFilter === 'all') return surveys;
    return surveys.filter((s) => s.status === statusFilter);
  }, [surveys, statusFilter]);

  function openCreate() {
    setEditingSurveyId(null);
    setInitialForm({ ...DEFAULT_FORM });
    setDialogOpen(true);
  }

  async function openEdit(survey: Survey) {
    setEditingSurveyId(survey.id);
    try {
      const full = await apiClient<Survey>(`/api/v1/staff-wellbeing/surveys/${survey.id}`);
      setInitialForm({
        title: full.title,
        description: full.description ?? '',
        frequency: full.frequency,
        window_opens_at: full.window_opens_at,
        window_closes_at: full.window_closes_at,
        min_response_threshold: full.min_response_threshold,
        dept_drill_down_threshold: full.dept_drill_down_threshold,
        moderation_enabled: full.moderation_enabled,
        questions: (full.questions ?? [])
          .sort((a, b) => a.display_order - b.display_order)
          .map((q) => ({
            tempId: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options ?? [],
            is_required: q.is_required,
          })),
      });
      setDialogOpen(true);
    } catch (err) {
      console.error('[SurveysSection.openEdit]', err);
    }
  }

  async function handleClone(surveyId: string) {
    try {
      const cloned = await apiClient<Survey>(`/api/v1/staff-wellbeing/surveys/${surveyId}/clone`, {
        method: 'POST',
      });
      await fetchSurveys();
      void openEdit(cloned);
    } catch (err) {
      console.error('[SurveysSection.handleClone]', err);
    }
  }

  return (
    <section id="surveys" className="scroll-mt-24 space-y-4">
      <SectionHeader
        icon={<ClipboardList className="h-5 w-5 text-brand" aria-hidden="true" />}
        title={tStaff('sections.surveys.title')}
        description={tStaff('sections.surveys.description')}
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="me-1.5 h-4 w-4" />
            {t('createSurvey')}
          </Button>
        }
      />

      <SurveyList
        surveys={filteredSurveys}
        isLoading={isLoading}
        page={page}
        total={total}
        statusFilter={statusFilter}
        onStatusFilterChange={(s) => {
          setStatusFilter(s);
          setPage(1);
        }}
        onPageChange={setPage}
        onCreateClick={openCreate}
        onEditClick={(survey) => void openEdit(survey)}
        onCloneClick={(id) => void handleClone(id)}
        onActivateClick={(id) => setConfirmAction({ type: 'activate', surveyId: id })}
        onCloseClick={(id) => setConfirmAction({ type: 'close', surveyId: id })}
      />

      <SurveyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingSurveyId={editingSurveyId}
        initialForm={initialForm}
        onSaved={() => void fetchSurveys()}
      />

      <SurveyConfirmDialog
        confirmAction={confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirmed={() => void fetchSurveys()}
      />
    </section>
  );
}
