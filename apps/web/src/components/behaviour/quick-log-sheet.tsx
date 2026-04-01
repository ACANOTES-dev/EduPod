'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { CategoryPicker, type CategoryOption } from './category-picker';



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

interface QuickLogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickLogSheet({ open, onOpenChange }: QuickLogSheetProps) {
  const t = useTranslations('behaviour.components.quickLog');
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [templates, setTemplates] = React.useState<TemplateOption[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentOption | null>(null);
  const [description, setDescription] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch categories on open
  React.useEffect(() => {
    if (!open) return;
    apiClient<{ data: CategoryOption[] }>(
      '/api/v1/behaviour/categories?pageSize=100&is_active=true',
    )
      .then((res) => setCategories(res.data ?? []))
      .catch(() => undefined);
    apiClient<{ data: TemplateOption[] }>('/api/v1/behaviour/templates?pageSize=50')
      .then((res) => setTemplates(res.data ?? []))
      .catch(() => undefined);
  }, [open]);

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

  const resetForm = () => {
    setSelectedCategoryId(null);
    setSelectedStudent(null);
    setStudentSearch('');
    setDescription('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!selectedCategoryId) {
      setError(t('errors.selectCategory'));
      return;
    }
    if (!selectedStudent) {
      setError(t('errors.selectStudent'));
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await apiClient('/api/v1/behaviour/incidents/quick-log', {
        method: 'POST',
        body: JSON.stringify({
          category_id: selectedCategoryId,
          student_ids: [selectedStudent.id],
          description: description || undefined,
          context_type: 'class',
          idempotency_key: crypto.randomUUID(),
          academic_year_id: '', // Will be resolved server-side from current year
        }),
      });
      resetForm();
      onOpenChange(false);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? t('errors.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTemplateChip = (template: TemplateOption) => {
    setDescription((prev) => (prev ? `${prev} ${template.body_template}` : template.body_template));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Category Picker */}
          <div>
            <Label className="mb-2 block text-sm font-medium">{t('category')}</Label>
            <CategoryPicker
              categories={categories}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
            />
          </div>

          {/* Student Search */}
          <div>
            <Label className="mb-2 block text-sm font-medium">{t('student')}</Label>
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-3 py-2">
                <span className="text-sm font-medium text-text-primary">
                  {selectedStudent.first_name} {selectedStudent.last_name}
                  {selectedStudent.year_group && (
                    <span className="ms-2 text-xs text-text-tertiary">
                      {selectedStudent.year_group.name}
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedStudent(null);
                    setStudentSearch('');
                  }}
                >
                  {t('change')}
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder={t('searchStudents')}
                  className="ps-9 text-base"
                />
                {studentResults.length > 0 && (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                    {studentResults.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-surface-secondary"
                          onClick={() => {
                            setSelectedStudent(s);
                            setStudentSearch('');
                            setStudentResults([]);
                          }}
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
            )}
          </div>

          {/* Template chips */}
          {templates.length > 0 && (
            <div>
              <Label className="mb-2 block text-sm font-medium">{t('templates')}</Label>
              <div className="flex flex-wrap gap-2">
                {templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleTemplateChip(tmpl)}
                    className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <Label className="mb-2 block text-sm font-medium">{t('description')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('addDetails')}
              rows={3}
              className="text-base"
            />
          </div>

          {error && <p className="text-sm text-danger-text">{error}</p>}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedCategoryId || !selectedStudent}
            className="w-full"
          >
            {submitting ? t('logging') : t('logIncident')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
