'use client';

import { Copy, FileText, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { HomeworkCard } from '../_components/homework-card';


// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassOption {
  id: string;
  name: string;
  year_group?: { name: string };
}

interface SubjectOption {
  id: string;
  name: string;
}

interface TemplateHomework {
  id: string;
  title: string;
  description?: string;
  homework_type: string;
  class_id: string;
  subject_id?: string;
  max_points?: number;
  created_at: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomeworkTemplatesPage() {
  const t = useTranslations('homework');
  const [loading, setLoading] = React.useState(true);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);
  const [templates, setTemplates] = React.useState<TemplateHomework[]>([]);
  const [selectedClass, setSelectedClass] = React.useState('');
  const [selectedSubject, setSelectedSubject] = React.useState('');
  const [selectedTemplate, setSelectedTemplate] = React.useState<TemplateHomework | null>(null);
  const [showCopyDialog, setShowCopyDialog] = React.useState(false);
  const [newDueDate, setNewDueDate] = React.useState('');
  const [copying, setCopying] = React.useState(false);

  // Fetch classes and subjects for filters
  const fetchFilters = React.useCallback(async () => {
    try {
      const [classesRes, subjectsRes] = await Promise.all([
        apiClient<{ data: ClassOption[] }>('/api/v1/classes', { silent: true }),
        apiClient<{ data: SubjectOption[] }>('/api/v1/subjects', { silent: true }),
      ]);
      setClasses(classesRes.data ?? []);
      setSubjects(subjectsRes.data ?? []);
    } catch (err) {
      console.error('[Templates] Failed to fetch filters', err);
    }
  }, []);

  // Fetch templates (published homework as templates)
  const fetchTemplates = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'published', pageSize: '100' });
      if (selectedClass) params.append('class_id', selectedClass);
      if (selectedSubject) params.append('subject_id', selectedSubject);

      const res = await apiClient<{ data: TemplateHomework[] }>(
        `/api/v1/homework?${params.toString()}`,
        { silent: true },
      );
      setTemplates(res.data ?? []);
    } catch (err) {
      console.error('[Templates] Failed to fetch templates', err);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedSubject]);

  React.useEffect(() => {
    void fetchFilters();
  }, [fetchFilters]);

  React.useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const handleCopyClick = (template: TemplateHomework) => {
    setSelectedTemplate(template);
    // Default due date to next week
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setNewDueDate(nextWeek.toISOString().split('T')[0] ?? '');
    setShowCopyDialog(true);
  };

  const handleCopy = async () => {
    if (!selectedTemplate || !newDueDate) return;

    setCopying(true);
    try {
      await apiClient('/api/v1/homework', {
        method: 'POST',
        body: JSON.stringify({
          title: selectedTemplate.title,
          description: selectedTemplate.description,
          homework_type: selectedTemplate.homework_type,
          class_id: selectedTemplate.class_id,
          subject_id: selectedTemplate.subject_id,
          max_points: selectedTemplate.max_points,
          due_date: newDueDate,
          status: 'draft',
        }),
      });
      setShowCopyDialog(false);
      setSelectedTemplate(null);
      // Show success toast or redirect
      window.location.href = window.location.pathname.replace('/templates', '');
    } catch (err) {
      console.error('[Templates] Failed to copy:', err);
    } finally {
      setCopying(false);
    }
  };

  const getClassName = (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    return cls?.name ?? '';
  };

  const getSubjectName = (subjectId?: string) => {
    if (!subjectId) return undefined;
    const subj = subjects.find((s) => s.id === subjectId);
    return subj?.name;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('templates.title')} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-text-tertiary" />
          <Select
            value={selectedClass || 'all'}
            onValueChange={(v) => setSelectedClass(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('filterAll')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filterAll')}</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select
          value={selectedSubject || 'all'}
          onValueChange={(v) => setSelectedSubject(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('templates.filterBySubject')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('templates.filterBySubject')}</SelectItem>
            {subjects.map((subj) => (
              <SelectItem key={subj.id} value={subj.id}>
                {subj.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-surface-secondary animate-pulse" />
          ))}
        </div>
      ) : templates.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <div key={template.id} className="relative group">
              <HomeworkCard
                id={template.id}
                title={template.title}
                class_name={getClassName(template.class_id)}
                subject_name={getSubjectName(template.subject_id)}
                homework_type={template.homework_type}
                due_date={template.created_at}
                status="published"
                onClick={() => {}}
              />
              <button
                type="button"
                onClick={() => handleCopyClick(template)}
                className="absolute top-2 end-2 p-2 rounded-lg bg-primary-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title={t('templates.copyFrom')}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title={t('templates.noTemplates')}
          description={t('templates.noTemplatesDesc')}
        />
      )}

      {/* Copy Dialog */}
      {showCopyDialog && selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
              {t('templates.copyFrom')}
            </h2>
            <p className="mb-4 text-sm text-text-secondary">{selectedTemplate.title}</p>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-text-primary">
                {t('dueDate')}
              </label>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCopyDialog(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleCopy} disabled={!newDueDate || copying}>
                {copying ? t('common.loading') : t('templates.copyFrom')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
