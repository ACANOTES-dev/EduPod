'use client';
/* eslint-disable school/no-hand-rolled-forms -- legacy form; migrate to react-hook-form when touched (HR-025) */

import { ArrowLeft } from 'lucide-react';
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
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subject {
  id: string;
  name: string;
  subject_type: string;
}

interface AcademicPeriod {
  id: string;
  name: string;
}

interface AssessmentCategory {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewAssessmentPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const params = useParams();
  const classId = params?.classId as string;

  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [categories, setCategories] = React.useState<AssessmentCategory[]>([]);

  const [subjectId, setSubjectId] = React.useState('');
  const [periodId, setPeriodId] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [maxScore, setMaxScore] = React.useState('100');
  const [dueDate, setDueDate] = React.useState('');
  const [gradingDeadline, setGradingDeadline] = React.useState('');
  const [countsTowardReportCard, setCountsTowardReportCard] = React.useState(true);

  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    apiClient<ListResponse<Subject>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setSubjects(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<AssessmentCategory>>(
      '/api/v1/gradebook/assessment-categories?pageSize=50',
    )
      .then((res) => setCategories(res.data))
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !periodId || !categoryId || !title.trim() || !maxScore) return;
    setSaving(true);
    try {
      await apiClient('/api/v1/gradebook/assessments', {
        method: 'POST',
        body: JSON.stringify({
          class_id: classId,
          subject_id: subjectId,
          academic_period_id: periodId,
          category_id: categoryId,
          title: title.trim(),
          max_score: Number(maxScore),
          due_date: dueDate || undefined,
          grading_deadline: gradingDeadline || undefined,
          counts_toward_report_card: countsTowardReportCard,
        }),
      });
      router.push(`/${locale}/gradebook/${classId}`);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${locale}/gradebook/${classId}`)}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <PageHeader title={t('newAssessment')} />
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
        <div>
          <Label htmlFor="assessment-title">Title</Label>
          <Input
            id="assessment-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Midterm Exam"
            required
          />
        </div>

        <div>
          <Label>{t('subject')}</Label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${t('subject').toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{t('period')}</Label>
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${t('period').toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{t('category')}</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${t('category').toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="assessment-max-score">{t('maxScore')}</Label>
          <Input
            id="assessment-max-score"
            type="number"
            min={1}
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="assessment-due-date">{t('dueDate')}</Label>
          <Input
            id="assessment-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="assessment-grading-deadline">{t('gradingDeadline')}</Label>
          <Input
            id="assessment-grading-deadline"
            type="date"
            value={gradingDeadline}
            onChange={(e) => setGradingDeadline(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="counts-toward-report-card"
            type="checkbox"
            checked={countsTowardReportCard}
            onChange={(e) => setCountsTowardReportCard(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
          />
          <Label htmlFor="counts-toward-report-card" className="cursor-pointer">
            {t('countsTowardReportCard')}
          </Label>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/${locale}/gradebook/${classId}`)}
          >
            {tc('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={saving || !subjectId || !periodId || !categoryId || !title.trim()}
          >
            {saving ? tc('loading') : tc('create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
