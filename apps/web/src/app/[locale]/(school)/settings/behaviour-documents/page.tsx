'use client';

import { ChevronDown, ChevronRight, Eye, Lock, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentTemplate {
  id: string;
  name: string;
  document_type: string;
  locale: string;
  body: string;
  is_system: boolean;
  is_active: boolean;
}

interface TemplatesResponse {
  data: DocumentTemplate[];
}

interface TemplateForm {
  name: string;
  document_type: string;
  locale: string;
  body: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  incident_notice: 'Incident Notice',
  sanction_letter: 'Sanction Letter',
  parent_notification: 'Parent Notification',
  suspension_letter: 'Suspension Letter',
  exclusion_letter: 'Exclusion Letter',
  reinstatement_letter: 'Reinstatement Letter',
  behaviour_report: 'Behaviour Report',
  contact_pack: 'Contact Pack',
};

const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS);

const LOCALE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
];

// ─── Merge field reference grouped by source ──────────────────────────────────

const MERGE_FIELDS: Array<{ group: string; fields: Array<{ key: string; desc: string }> }> = [
  {
    group: 'School',
    fields: [
      { key: '{{school.name}}', desc: 'School name' },
      { key: '{{school.address}}', desc: 'School address' },
      { key: '{{school.phone}}', desc: 'School phone number' },
      { key: '{{school.logo_url}}', desc: 'School logo URL' },
    ],
  },
  {
    group: 'Student',
    fields: [
      { key: '{{student.first_name}}', desc: 'Student first name' },
      { key: '{{student.last_name}}', desc: 'Student last name' },
      { key: '{{student.full_name}}', desc: 'Student full name' },
      { key: '{{student.year_group}}', desc: 'Year group name' },
      { key: '{{student.class}}', desc: 'Class name' },
      { key: '{{student.date_of_birth}}', desc: 'Date of birth' },
    ],
  },
  {
    group: 'Parent / Guardian',
    fields: [
      { key: '{{parent.full_name}}', desc: 'Primary contact full name' },
      { key: '{{parent.email}}', desc: 'Primary contact email' },
    ],
  },
  {
    group: 'Incident',
    fields: [
      { key: '{{incident.number}}', desc: 'Incident reference number' },
      { key: '{{incident.occurred_at}}', desc: 'Date and time of incident' },
      { key: '{{incident.description}}', desc: 'Incident description' },
      { key: '{{incident.category}}', desc: 'Category name' },
      { key: '{{incident.location}}', desc: 'Location' },
    ],
  },
  {
    group: 'Sanction',
    fields: [
      { key: '{{sanction.number}}', desc: 'Sanction reference number' },
      { key: '{{sanction.type}}', desc: 'Sanction type' },
      { key: '{{sanction.scheduled_date}}', desc: 'Scheduled date' },
      { key: '{{sanction.notes}}', desc: 'Notes / conditions' },
    ],
  },
  {
    group: 'Document',
    fields: [
      { key: '{{document.generated_at}}', desc: 'Document generation date' },
      { key: '{{document.generated_by}}', desc: 'Staff name who generated document' },
    ],
  },
];

const DEFAULT_FORM: TemplateForm = {
  name: '',
  document_type: 'incident_notice',
  locale: 'en',
  body: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourDocumentTemplatesPage() {
  const t = useTranslations('behaviourSettings.documents');
  const [templates, setTemplates] = React.useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [editOpen, setEditOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DocumentTemplate | null>(null);
  const [form, setForm] = React.useState<TemplateForm>(DEFAULT_FORM);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');

  const [previewOpen, setPreviewOpen] = React.useState(false);

  const [mergeFieldsOpen, setMergeFieldsOpen] = React.useState(false);

  // Mobile: panel visibility
  const [isMobile, setIsMobile] = React.useState(false);
  const [mobileShowEditor, setMobileShowEditor] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchTemplates = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<TemplatesResponse>(
        '/api/v1/behaviour/document-templates?pageSize=100',
      );
      setTemplates(res.data ?? []);
      if (!selectedId && (res.data ?? []).length > 0) {
        const first = res.data[0];
        if (first) setSelectedId(first.id);
      }
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  React.useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  // Group templates by document_type
  const grouped = React.useMemo(() => {
    const map = new Map<string, DocumentTemplate[]>();
    for (const t of templates) {
      const group = map.get(t.document_type) ?? [];
      group.push(t);
      map.set(t.document_type, group);
    }
    return Array.from(map.entries()).map(([type, items]) => ({ type, items }));
  }, [templates]);

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

  const openCreate = () => {
    setEditTarget(null);
    setForm(DEFAULT_FORM);
    setSaveError('');
    setEditOpen(true);
  };

  const openEdit = (template: DocumentTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(template);
    setForm({
      name: template.name,
      document_type: template.document_type,
      locale: template.locale,
      body: template.body,
    });
    setSaveError('');
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setSaveError('Template name is required');
      return;
    }
    if (!form.body.trim()) {
      setSaveError('Template body is required');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        name: form.name.trim(),
        document_type: form.document_type,
        locale: form.locale,
        body: form.body,
      };
      if (editTarget) {
        await apiClient(`/api/v1/behaviour/document-templates/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/behaviour/document-templates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setEditOpen(false);
      void fetchTemplates();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setSaveError(ex?.error?.message ?? 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const updateForm = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelectTemplate = (id: string) => {
    setSelectedId(id);
    if (isMobile) setMobileShowEditor(true);
  };

  // ─── Left Panel: Template List ───────────────────────────────────────────

  const leftPanel = (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between pb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Templates
        </p>
        <Button variant="ghost" size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          <span className="ms-1 text-xs">New</span>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <p className="text-xs text-text-tertiary">No templates yet.</p>
      ) : (
        grouped.map(({ type, items }) => (
          <div key={type} className="mb-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {DOCUMENT_TYPE_LABELS[type] ?? type}
            </p>
            {items.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tpl.id)}
                className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm transition-colors ${
                  selectedId === tpl.id
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                }`}
              >
                {tpl.is_system ? (
                  <Lock className="h-3 w-3 shrink-0 text-text-tertiary" />
                ) : (
                  <div className="h-3 w-3 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{tpl.name}</span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {tpl.locale.toUpperCase()}
                </Badge>
                {!tpl.is_system && (
                  <Pencil
                    className="h-3 w-3 shrink-0 text-text-tertiary opacity-0 group-hover:opacity-100"
                    onClick={(e) => openEdit(tpl, e)}
                  />
                )}
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  );

  // ─── Right Panel: Template Editor / Viewer ───────────────────────────────

  const rightPanel = selectedTemplate ? (
    <div className="flex flex-col gap-4">
      {/* Mobile back button */}
      {isMobile && (
        <button
          type="button"
          onClick={() => setMobileShowEditor(false)}
          className="flex items-center gap-1 text-sm text-primary-600"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to list
        </button>
      )}

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary">{selectedTemplate.name}</h2>
            {selectedTemplate.is_system && (
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                <Lock className="h-3 w-3" />
                System
              </span>
            )}
            <Badge variant="secondary" className="text-xs">
              {LOCALE_OPTIONS.find((l) => l.value === selectedTemplate.locale)?.label ??
                selectedTemplate.locale}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {DOCUMENT_TYPE_LABELS[selectedTemplate.document_type] ?? selectedTemplate.document_type}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="me-1.5 h-3.5 w-3.5" />
            Preview
          </Button>
          {!selectedTemplate.is_system && (
            <Button size="sm" onClick={(e) => openEdit(selectedTemplate, e)}>
              <Pencil className="me-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Template body viewer */}
      <div>
        <Label className="mb-1.5 block text-xs">Template Body</Label>
        <pre className="w-full overflow-x-auto rounded-lg border border-border bg-gray-50 p-4 font-mono text-xs leading-relaxed text-text-primary dark:bg-gray-900">
          {selectedTemplate.body}
        </pre>
      </div>

      {/* Merge field reference */}
      <div className="rounded-xl border border-border bg-surface">
        <button
          type="button"
          onClick={() => setMergeFieldsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-primary"
        >
          <span>Available Merge Fields</span>
          {mergeFieldsOpen ? (
            <ChevronDown className="h-4 w-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-tertiary" />
          )}
        </button>

        {mergeFieldsOpen && (
          <div className="border-t border-border px-4 pb-4 pt-3">
            <div className="space-y-4">
              {MERGE_FIELDS.map((group) => (
                <div key={group.group}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {group.group}
                  </p>
                  <div className="space-y-1">
                    {group.fields.map((field) => (
                      <div
                        key={field.key}
                        className="flex flex-wrap items-center gap-x-3 gap-y-0.5"
                      >
                        <code className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-primary-700 dark:bg-gray-800 dark:text-primary-300">
                          {field.key}
                        </code>
                        <span className="text-xs text-text-tertiary">{field.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
      <Pencil className="h-8 w-8 text-text-tertiary/30" />
      <p className="mt-3 text-sm text-text-secondary">Select a template to view or edit</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
        <Plus className="me-1.5 h-3.5 w-3.5" />
        Create New Template
      </Button>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {t('newTemplate')}
          </Button>
        }
      />

      {/* Two-panel layout — stacked on mobile, side-by-side on md+ */}
      <div className="flex flex-col gap-6 md:flex-row md:gap-0">
        {/* Left: template list */}
        <div
          className={`shrink-0 md:w-60 md:border-e md:border-border md:pe-4 ${
            isMobile && mobileShowEditor ? 'hidden' : 'block'
          }`}
        >
          {leftPanel}
        </div>

        {/* Right: editor */}
        <div className={`flex-1 md:ps-6 ${isMobile && !mobileShowEditor ? 'hidden' : 'block'}`}>
          {rightPanel}
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Template' : 'New Template'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Template Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="e.g. Standard Detention Letter (EN)"
                className="text-base"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Document Type</Label>
                <Select
                  value={form.document_type}
                  onValueChange={(v) => updateForm('document_type', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((dt) => (
                      <SelectItem key={dt} value={dt}>
                        {DOCUMENT_TYPE_LABELS[dt] ?? dt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Locale</Label>
                <Select value={form.locale} onValueChange={(v) => updateForm('locale', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Template Body *</Label>
              <p className="text-xs text-text-tertiary">
                Use Handlebars syntax. Reference the merge fields list below.
              </p>
              <textarea
                value={form.body}
                onChange={(e) => updateForm('body', e.target.value)}
                rows={16}
                className="w-full rounded-lg border border-border bg-gray-50 p-3 font-mono text-xs leading-relaxed text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-600 dark:bg-gray-900"
                placeholder={
                  '<h1>{{school.name}}</h1>\n\n<p>Dear {{parent.full_name}},</p>\n\n<p>We are writing to inform you about an incident involving {{student.full_name}}...</p>'
                }
                spellCheck={false}
              />
            </div>

            {/* Inline merge field reference */}
            <div className="rounded-xl border border-border bg-surface">
              <button
                type="button"
                onClick={() => setMergeFieldsOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-text-secondary"
              >
                <span>Merge Field Reference</span>
                {mergeFieldsOpen ? (
                  <ChevronDown className="h-4 w-4 text-text-tertiary" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-text-tertiary" />
                )}
              </button>
              {mergeFieldsOpen && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {MERGE_FIELDS.map((group) => (
                      <div key={group.group}>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                          {group.group}
                        </p>
                        <div className="space-y-0.5">
                          {group.fields.map((field) => (
                            <div key={field.key} className="flex flex-wrap items-center gap-2">
                              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] text-primary-700 dark:bg-gray-800 dark:text-primary-300">
                                {field.key}
                              </code>
                              <span className="text-[10px] text-text-tertiary">{field.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {saveError && <p className="text-sm text-danger-text">{saveError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editTarget ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog — renders raw body with a note that this is the unprocessed template */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              This preview shows the raw template with merge fields as-is. In a generated document,
              all <code className="font-mono">{'{{placeholders}}'}</code> are replaced with real
              student, incident, and sanction data.
            </div>
            {selectedTemplate && (
              <div
                className="prose prose-sm max-w-none rounded-lg border border-border bg-white p-5 dark:bg-gray-950"
                /* eslint-disable-next-line react/no-danger */
                dangerouslySetInnerHTML={{ __html: selectedTemplate.body }}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
