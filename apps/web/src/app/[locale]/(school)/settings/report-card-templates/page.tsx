'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
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
  StatusBadge,
  Switch,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionType =
  | 'header'
  | 'student_info'
  | 'grades_table'
  | 'attendance_summary'
  | 'competency_summary'
  | 'conduct'
  | 'extracurriculars'
  | 'custom_text'
  | 'teacher_comment'
  | 'principal_comment'
  | 'threshold_remarks'
  | 'comparative_indicators'
  | 'qr_code'
  | 'signature_area';

interface TemplateSection {
  id: string;
  type: SectionType;
  order: number;
  style_variant: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface BrandingOverrides {
  primary_color: string;
  font_family: string;
  logo_position: 'start' | 'center' | 'end';
}

interface ReportCardTemplate {
  id: string;
  name: string;
  locale: 'en' | 'ar';
  is_default: boolean;
  sections_json: TemplateSection[];
  branding_overrides_json: BrandingOverrides | null;
  created_at: string;
}

interface ListResponse<T> {
  data: T[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_TYPES: SectionType[] = [
  'header',
  'student_info',
  'grades_table',
  'attendance_summary',
  'competency_summary',
  'conduct',
  'extracurriculars',
  'custom_text',
  'teacher_comment',
  'principal_comment',
  'threshold_remarks',
  'comparative_indicators',
  'qr_code',
  'signature_area',
];

const STYLE_VARIANTS: Record<SectionType, string[]> = {
  header: ['standard', 'minimal', 'bold'],
  student_info: ['compact', 'detailed'],
  grades_table: ['compact', 'expanded', 'bordered', 'minimal'],
  attendance_summary: ['compact', 'detailed'],
  competency_summary: ['bars', 'labels', 'badges'],
  conduct: ['compact', 'detailed'],
  extracurriculars: ['list', 'grid'],
  custom_text: ['standard'],
  teacher_comment: ['standard', 'boxed'],
  principal_comment: ['standard', 'boxed'],
  threshold_remarks: ['inline', 'badge'],
  comparative_indicators: ['subtle', 'prominent'],
  qr_code: ['small', 'medium'],
  signature_area: ['single', 'double'],
};

const FONTS = ['Inter', 'Roboto', 'Open Sans', 'Noto Sans Arabic', 'Cairo', 'Tajawal'];

const DEFAULT_BRANDING: BrandingOverrides = {
  primary_color: '#1d4ed8',
  font_family: 'Inter',
  logo_position: 'start',
};

function buildDefaultSections(): TemplateSection[] {
  return [
    {
      id: 'header',
      type: 'header',
      order: 1,
      style_variant: 'standard',
      enabled: true,
      config: {},
    },
    {
      id: 'student_info',
      type: 'student_info',
      order: 2,
      style_variant: 'compact',
      enabled: true,
      config: {},
    },
    {
      id: 'grades_table',
      type: 'grades_table',
      order: 3,
      style_variant: 'bordered',
      enabled: true,
      config: { show_percentage: true, show_assessment_detail: false },
    },
    {
      id: 'attendance_summary',
      type: 'attendance_summary',
      order: 4,
      style_variant: 'compact',
      enabled: true,
      config: {},
    },
    {
      id: 'teacher_comment',
      type: 'teacher_comment',
      order: 5,
      style_variant: 'standard',
      enabled: true,
      config: {},
    },
    {
      id: 'principal_comment',
      type: 'principal_comment',
      order: 6,
      style_variant: 'standard',
      enabled: true,
      config: {},
    },
    {
      id: 'signature_area',
      type: 'signature_area',
      order: 7,
      style_variant: 'single',
      enabled: true,
      config: {},
    },
    {
      id: 'qr_code',
      type: 'qr_code',
      order: 8,
      style_variant: 'small',
      enabled: false,
      config: {},
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardTemplatesPage() {
  const t = useTranslations('settings');
  const tr = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [templates, setTemplates] = React.useState<ReportCardTemplate[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<ReportCardTemplate | null>(null);
  const [creating, setCreating] = React.useState(false);

  const fetchTemplates = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<ListResponse<ReportCardTemplate>>(
        '/api/v1/report-card-templates',
      );
      setTemplates(res.data);
    } catch {
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = () => {
    const newTemplate: ReportCardTemplate = {
      id: '',
      name: '',
      locale: 'en',
      is_default: false,
      sections_json: buildDefaultSections(),
      branding_overrides_json: { ...DEFAULT_BRANDING },
      created_at: new Date().toISOString(),
    };
    setEditing(newTemplate);
    setCreating(true);
  };

  const handleEdit = (tmpl: ReportCardTemplate) => {
    setEditing({ ...tmpl, sections_json: [...tmpl.sections_json] });
    setCreating(false);
  };

  const handleSetDefault = async (id: string) => {
    try {
      await apiClient(`/api/v1/report-card-templates/${id}/set-default`, { method: 'POST' });
      toast.success(tr('templateSetAsDefault'));
      void fetchTemplates();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/report-card-templates/${id}`, { method: 'DELETE' });
      toast.success(tc('deleted'));
      void fetchTemplates();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        isNew={creating}
        onSave={async (updated) => {
          try {
            if (creating) {
              await apiClient('/api/v1/report-card-templates', {
                method: 'POST',
                body: JSON.stringify({
                  name: updated.name,
                  locale: updated.locale,
                  sections_json: updated.sections_json,
                  branding_overrides_json: updated.branding_overrides_json,
                }),
              });
            } else {
              await apiClient(`/api/v1/report-card-templates/${updated.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  name: updated.name,
                  sections_json: updated.sections_json,
                  branding_overrides_json: updated.branding_overrides_json,
                }),
              });
            }
            toast.success(tc('saved'));
            setEditing(null);
            void fetchTemplates();
          } catch {
            toast.error(tc('errorGeneric'));
          }
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('reportCardTemplates')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('reportCardTemplatesDesc')}</p>
        </div>
        <Button onClick={handleCreate} className="w-full sm:w-auto">
          <Plus className="me-2 h-4 w-4" />
          {tr('newTemplate')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-text-tertiary">{tc('noResults')}</p>
          <Button variant="outline" onClick={handleCreate} className="mt-4">
            <Plus className="me-2 h-4 w-4" />
            {tr('newTemplate')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tmpl) => (
            <div
              key={tmpl.id}
              className="rounded-2xl border border-border bg-surface p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-text-primary truncate">{tmpl.name}</p>
                  <p className="text-xs text-text-tertiary mt-0.5 uppercase" dir="ltr">
                    {tmpl.locale}
                  </p>
                </div>
                {tmpl.is_default && (
                  <StatusBadge status="success">
                    <Star className="me-1 h-3 w-3" />
                    {tr('default')}
                  </StatusBadge>
                )}
              </div>
              <p className="text-xs text-text-tertiary">
                {tmpl.sections_json.filter((s) => s.enabled).length} {tr('sectionsEnabled')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEdit(tmpl)}>
                  {tc('edit')}
                </Button>
                {!tmpl.is_default && (
                  <Button size="sm" variant="ghost" onClick={() => void handleSetDefault(tmpl.id)}>
                    <Star className="me-1 h-3.5 w-3.5" />
                    {tr('setAsDefault')}
                  </Button>
                )}
                {!tmpl.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-error-600 hover:text-error-700"
                    onClick={() => void handleDelete(tmpl.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Template Editor ──────────────────────────────────────────────────────────

interface TemplateEditorProps {
  template: ReportCardTemplate;
  isNew: boolean;
  onSave: (updated: ReportCardTemplate) => Promise<void>;
  onCancel: () => void;
}

function TemplateEditor({ template, isNew, onSave, onCancel }: TemplateEditorProps) {
  const t = useTranslations('settings');
  const tr = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [name, setName] = React.useState(template.name);
  const [locale, setLocale] = React.useState<'en' | 'ar'>(template.locale);
  const [sections, setSections] = React.useState<TemplateSection[]>(
    [...template.sections_json].sort((a, b) => a.order - b.order),
  );
  const [branding, setBranding] = React.useState<BrandingOverrides>(
    template.branding_overrides_json ?? { ...DEFAULT_BRANDING },
  );
  const [expandedSection, setExpandedSection] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [addType, setAddType] = React.useState<SectionType>('custom_text');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleToggleSection = (id: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const handleMoveUp = (idx: number) => {
    if (idx === 0) return;
    setSections((prev) => {
      const next = [...prev];
      const temp = next[idx - 1]!;
      next[idx - 1] = { ...next[idx]!, order: idx };
      next[idx] = { ...temp, order: idx + 1 };
      return next;
    });
  };

  const handleMoveDown = (idx: number) => {
    setSections((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[idx + 1]!;
      next[idx + 1] = { ...next[idx]!, order: idx + 2 };
      next[idx] = { ...temp, order: idx + 1 };
      return next;
    });
  };

  const handleStyleChange = (id: string, variant: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, style_variant: variant } : s)));
  };

  const handleConfigChange = (id: string, key: string, value: unknown) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s)),
    );
  };

  const handleAddSection = () => {
    const exists = sections.find((s) => s.type === addType);
    if (exists) {
      toast.error(tr('sectionAlreadyExists'));
      return;
    }
    const newSection: TemplateSection = {
      id: `${addType}_${Date.now()}`,
      type: addType,
      order: sections.length + 1,
      style_variant: (STYLE_VARIANTS[addType] ?? ['standard'])[0] ?? 'standard',
      enabled: true,
      config: {},
    };
    setSections((prev) => [...prev, newSection]);
  };

  const handleRemoveSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient<{ data: { sections_json: TemplateSection[] } }>(
        '/api/v1/report-card-templates/ai-convert',
        {
          method: 'POST',
          headers: {},
          body: formData,
        },
      );
      setSections(res.data.sections_json.sort((a, b) => a.order - b.order));
      toast.success(tr('aiConvertSuccess'));
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(tr('templateNameRequired'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...template,
        name,
        locale,
        sections_json: sections.map((s, idx) => ({ ...s, order: idx + 1 })),
        branding_overrides_json: branding,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {isNew ? tr('newTemplate') : tr('editTemplate')}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">
            {tc('cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            {tc('save')}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Section Editor */}
        <div className="lg:col-span-2 space-y-4">
          {/* Name + Locale */}
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">{tc('details')}</h3>
            <div className="space-y-1.5">
              <Label>{tr('templateName')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr('templateNamePlaceholder')}
              />
            </div>
            {isNew && (
              <div className="space-y-1.5">
                <Label>{tr('locale')}</Label>
                <Select value={locale} onValueChange={(v) => setLocale(v as 'en' | 'ar')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English (LTR)</SelectItem>
                    <SelectItem value="ar">Arabic (RTL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Sections list */}
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold text-text-primary">{tr('sections')}</h3>
              {/* Import from existing */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="sr-only"
                  onChange={(e) => void handleImportFile(e)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? (
                    <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="me-2 h-3.5 w-3.5" />
                  )}
                  {tr('importFromExisting')}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-border">
              {sections.map((section, idx) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  idx={idx}
                  total={sections.length}
                  expanded={expandedSection === section.id}
                  onToggleExpand={() =>
                    setExpandedSection(expandedSection === section.id ? null : section.id)
                  }
                  onToggleEnabled={() => handleToggleSection(section.id)}
                  onMoveUp={() => handleMoveUp(idx)}
                  onMoveDown={() => handleMoveDown(idx)}
                  onStyleChange={(v) => handleStyleChange(section.id, v)}
                  onConfigChange={(key, value) => handleConfigChange(section.id, key, value)}
                  onRemove={() => handleRemoveSection(section.id)}
                  tr={tr}
                  tc={tc}
                />
              ))}
            </div>

            {/* Add section */}
            <div className="border-t border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={addType} onValueChange={(v) => setAddType(v as SectionType)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTION_TYPES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {tr(`sectionType_${st}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleAddSection} className="shrink-0">
                  <Plus className="me-2 h-4 w-4" />
                  {tr('addSection')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Branding */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">{t('brandingOverrides')}</h3>

            <div className="space-y-1.5">
              <Label>{t('primaryColour')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding.primary_color}
                  onChange={(e) => setBranding((b) => ({ ...b, primary_color: e.target.value }))}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1"
                />
                <Input
                  value={branding.primary_color}
                  onChange={(e) => setBranding((b) => ({ ...b, primary_color: e.target.value }))}
                  className="font-mono text-sm"
                  placeholder="#1d4ed8"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{tr('fontFamily')}</Label>
              <Select
                value={branding.font_family}
                onValueChange={(v) => setBranding((b) => ({ ...b, font_family: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{tr('logoPosition')}</Label>
              <Select
                value={branding.logo_position}
                onValueChange={(v) =>
                  setBranding((b) => ({ ...b, logo_position: v as 'start' | 'center' | 'end' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">{tr('logoPositionStart')}</SelectItem>
                  <SelectItem value="center">{tr('logoPositionCenter')}</SelectItem>
                  <SelectItem value="end">{tr('logoPositionEnd')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section Row ──────────────────────────────────────────────────────────────

interface SectionRowProps {
  section: TemplateSection;
  idx: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStyleChange: (v: string) => void;
  onConfigChange: (key: string, value: unknown) => void;
  onRemove: () => void;
  tr: ReturnType<typeof useTranslations<'reportCards'>>;
  tc: ReturnType<typeof useTranslations<'common'>>;
}

function SectionRow({
  section,
  idx,
  total,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  onMoveUp,
  onMoveDown,
  onStyleChange,
  onConfigChange,
  onRemove,
  tr,
  tc,
}: SectionRowProps) {
  const variants = STYLE_VARIANTS[section.type] ?? ['standard'];

  return (
    <div className={`${!section.enabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 px-5 py-3">
        {/* Reorder */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            disabled={idx === 0}
            onClick={onMoveUp}
            className="rounded p-0.5 text-text-tertiary hover:text-text-secondary disabled:opacity-30"
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={idx === total - 1}
            onClick={onMoveDown}
            className="rounded p-0.5 text-text-tertiary hover:text-text-secondary disabled:opacity-30"
            aria-label="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>

        {/* Toggle enabled */}
        <Switch checked={section.enabled} onCheckedChange={onToggleEnabled} className="shrink-0" />

        {/* Label */}
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex flex-1 items-center gap-2 text-start min-w-0"
        >
          <span className="text-sm font-medium text-text-primary truncate">
            {tr(`sectionType_${section.type}`)}
          </span>
          <span className="text-xs text-text-tertiary hidden sm:inline">
            {section.style_variant}
          </span>
          {expanded ? (
            <ChevronDown className="ms-auto h-4 w-4 text-text-tertiary shrink-0" />
          ) : (
            <ChevronRight className="ms-auto h-4 w-4 text-text-tertiary shrink-0" />
          )}
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-text-tertiary hover:text-error-600"
          aria-label={tc('delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Config panel */}
      {expanded && (
        <div className="border-t border-border bg-surface-secondary px-5 py-4 space-y-3">
          {/* Style variant */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <Label className="text-xs shrink-0">{tr('styleVariant')}</Label>
            <Select value={section.style_variant} onValueChange={onStyleChange}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variants.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Config options per section type */}
          {section.type === 'grades_table' && (
            <>
              <ConfigBoolRow
                label={tr('showPercentage')}
                value={(section.config['show_percentage'] as boolean) ?? true}
                onChange={(v) => onConfigChange('show_percentage', v)}
              />
              <ConfigBoolRow
                label={tr('showAssessmentDetail')}
                value={(section.config['show_assessment_detail'] as boolean) ?? false}
                onChange={(v) => onConfigChange('show_assessment_detail', v)}
              />
            </>
          )}
          {section.type === 'attendance_summary' && (
            <ConfigBoolRow
              label={tr('showPatternAlerts')}
              value={(section.config['show_pattern_alerts'] as boolean) ?? true}
              onChange={(v) => onConfigChange('show_pattern_alerts', v)}
            />
          )}
          {section.type === 'comparative_indicators' && (
            <>
              <ConfigBoolRow
                label={tr('showComparativeLabel')}
                value={(section.config['show_label'] as boolean) ?? true}
                onChange={(v) => onConfigChange('show_label', v)}
              />
              <ConfigBoolRow
                label={tr('showPercentile')}
                value={(section.config['show_percentile'] as boolean) ?? false}
                onChange={(v) => onConfigChange('show_percentile', v)}
              />
              <ConfigBoolRow
                label={tr('showTopThreeRank')}
                value={(section.config['show_top_three'] as boolean) ?? false}
                onChange={(v) => onConfigChange('show_top_three', v)}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ConfigBoolRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-text-secondary">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
