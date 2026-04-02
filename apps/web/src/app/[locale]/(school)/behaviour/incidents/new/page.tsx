'use client';
/* eslint-disable school/no-hand-rolled-forms -- legacy form; migrate to react-hook-form when touched (HR-025) */

import { ArrowLeft, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Switch,
  Textarea,
} from '@school/ui';

import { CategoryPicker, type CategoryOption } from '@/components/behaviour/category-picker';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
  year_group?: { name: string } | null;
}

interface TemplateOption {
  id: string;
  name: string;
  body_template: string;
}

const CONTEXT_TYPE_KEYS = [
  'class',
  'break',
  'before_school',
  'after_school',
  'lunch',
  'transport',
  'extra_curricular',
  'off_site',
  'online',
  'other',
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateIncidentPage() {
  const t = useTranslations('behaviour.newIncident');
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  // Form state
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState('');
  const [parentDescription, setParentDescription] = React.useState('');
  const [contextType, setContextType] = React.useState('class');
  const [contextNotes, setContextNotes] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [occurredAt, setOccurredAt] = React.useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [autoSubmit, setAutoSubmit] = React.useState(true);

  // Student selection
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentOption[]>([]);
  const [selectedStudents, setSelectedStudents] = React.useState<StudentOption[]>([]);

  // Data
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [templates, setTemplates] = React.useState<TemplateOption[]>([]);

  // UI state
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load categories + templates
  React.useEffect(() => {
    apiClient<{ data: CategoryOption[] }>(
      '/api/v1/behaviour/categories?pageSize=100&is_active=true',
    )
      .then((res) => setCategories(res.data ?? []))
      .catch(() => undefined);
    apiClient<{ data: TemplateOption[] }>('/api/v1/behaviour/templates?pageSize=50')
      .then((res) => setTemplates(res.data ?? []))
      .catch(() => undefined);
  }, []);

  // Student search with debounce
  React.useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (studentSearch.length < 2) {
      setStudentResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      apiClient<{ data: StudentOption[] }>(
        `/api/v1/students?search=${encodeURIComponent(studentSearch)}&pageSize=10`,
      )
        .then((res) => setStudentResults(res.data ?? []))
        .catch(() => undefined);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [studentSearch]);

  const addStudent = (student: StudentOption) => {
    if (!selectedStudents.find((s) => s.id === student.id)) {
      setSelectedStudents((prev) => [...prev, student]);
    }
    setStudentSearch('');
    setStudentResults([]);
  };

  const removeStudent = (studentId: string) => {
    setSelectedStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const applyTemplate = (template: TemplateOption) => {
    setDescription((prev) =>
      prev ? `${prev}\n${template.body_template}` : template.body_template,
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) {
      setError(t('errors.selectCategory'));
      return;
    }
    if (selectedStudents.length === 0) {
      setError(t('errors.selectStudent'));
      return;
    }
    if (!description.trim()) {
      setError(t('errors.enterDescription'));
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/behaviour/incidents', {
        method: 'POST',
        body: JSON.stringify({
          category_id: categoryId,
          description: description.trim(),
          parent_description: parentDescription.trim() || undefined,
          context_type: contextType,
          context_notes: contextNotes.trim() || undefined,
          location: location.trim() || undefined,
          occurred_at: new Date(occurredAt).toISOString(),
          student_ids: selectedStudents.map((s) => s.id),
          auto_submit: autoSubmit,
          academic_year_id: '', // Server will resolve current year
          idempotency_key: crypto.randomUUID(),
        }),
      });
      router.push(`/${locale}/behaviour/incidents/${res.data.id}`);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? t('errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Link href={`/${locale}/behaviour/incidents`}>
            <Button variant="outline">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('back')}
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6">
        {/* Category Picker */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <Label className="mb-3 block text-sm font-semibold">{t('labels.category')}</Label>
          <CategoryPicker
            categories={categories}
            selectedId={categoryId}
            onSelect={setCategoryId}
          />
        </div>

        {/* Student Selection */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <Label className="mb-3 block text-sm font-semibold">{t('labels.students')}</Label>

          {/* Selected students chips */}
          {selectedStudents.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedStudents.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700"
                >
                  {s.first_name} {s.last_name}
                  <button
                    type="button"
                    onClick={() => removeStudent(s.id)}
                    className="hover:text-primary-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder={t('placeholders.searchStudents')}
              className="ps-9 text-base"
            />
            {studentResults.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                {studentResults
                  .filter((s) => !selectedStudents.find((sel) => sel.id === s.id))
                  .map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-surface-secondary"
                        onClick={() => addStudent(s)}
                      >
                        <span className="font-medium text-text-primary">
                          {s.first_name} {s.last_name}
                        </span>
                        {s.year_group && (
                          <span className="text-xs text-text-tertiary">{s.year_group.name}</span>
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        {/* Description + Templates */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <Label className="mb-3 block text-sm font-semibold">{t('labels.description')}</Label>

          {/* Template chips */}
          {templates.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => applyTemplate(tmpl)}
                  className="rounded-full border border-border bg-surface-secondary px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface"
                >
                  {tmpl.name}
                </button>
              ))}
            </div>
          )}

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('placeholders.description')}
            rows={4}
            className="text-base"
            required
          />

          {/* Parent-facing description */}
          <div className="mt-4">
            <Label className="mb-1 block text-xs text-text-tertiary">
              {t('labels.parentDescription')}
            </Label>
            <Textarea
              value={parentDescription}
              onChange={(e) => setParentDescription(e.target.value)}
              placeholder={t('placeholders.parentDescription')}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        {/* Context */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <Label className="mb-3 block text-sm font-semibold">{t('labels.context')}</Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-text-tertiary">{t('labels.when')}</Label>
              <Input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="text-base"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-text-tertiary">{t('labels.contextType')}</Label>
              <Select value={contextType} onValueChange={setContextType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTEXT_TYPE_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`contextTypes.${key}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-text-tertiary">{t('labels.location')}</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('placeholders.location')}
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-text-tertiary">{t('labels.notes')}</Label>
              <Input
                value={contextNotes}
                onChange={(e) => setContextNotes(e.target.value)}
                placeholder={t('placeholders.contextNotes')}
                className="text-base"
              />
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{t('labels.autoSubmit')}</Label>
              <p className="text-xs text-text-tertiary">{t('labels.autoSubmitDescription')}</p>
            </div>
            <Switch checked={autoSubmit} onCheckedChange={setAutoSubmit} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link href={`/${locale}/behaviour/incidents`}>
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              {t('cancel')}
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? t('creating') : autoSubmit ? t('submitIncident') : t('saveAsDraft')}
          </Button>
        </div>
      </form>
    </div>
  );
}
