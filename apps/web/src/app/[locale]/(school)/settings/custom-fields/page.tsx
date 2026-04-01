'use client';

import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
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

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'select' | 'rating';
type SectionType = 'conduct' | 'extracurricular' | 'custom';

interface CustomFieldDef {
  id: string;
  name: string;
  label: string;
  label_ar: string | null;
  field_type: FieldType;
  options_json: string[] | null;
  section_type: SectionType;
  display_order: number;
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomFieldsPage() {
  const t = useTranslations('settings');
  const tr = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [fields, setFields] = React.useState<CustomFieldDef[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<CustomFieldDef | null>(null);
  const [creatingNew, setCreatingNew] = React.useState(false);

  const fetchFields = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<ListResponse<CustomFieldDef>>(
        '/api/v1/report-card-custom-field-defs',
      );
      setFields(res.data.sort((a, b) => a.display_order - b.display_order));
    } catch {
      setFields([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchFields();
  }, [fetchFields]);

  const handleCreate = () => {
    const blank: CustomFieldDef = {
      id: '',
      name: '',
      label: '',
      label_ar: '',
      field_type: 'text',
      options_json: null,
      section_type: 'conduct',
      display_order: fields.length + 1,
    };
    setEditing(blank);
    setCreatingNew(true);
  };

  const handleEdit = (f: CustomFieldDef) => {
    setEditing({ ...f, options_json: f.options_json ? [...f.options_json] : null });
    setCreatingNew(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/report-card-custom-field-defs/${id}`, { method: 'DELETE' });
      toast.success(tc('deleted'));
      void fetchFields();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handleMoveUp = async (idx: number) => {
    if (idx === 0) return;
    const reordered = [...fields];
    const temp = reordered[idx - 1]!;
    reordered[idx - 1] = { ...reordered[idx]!, display_order: idx };
    reordered[idx] = { ...temp, display_order: idx + 1 };
    setFields(reordered);
    await saveOrder(reordered);
  };

  const handleMoveDown = async (idx: number) => {
    if (idx >= fields.length - 1) return;
    const reordered = [...fields];
    const temp = reordered[idx + 1]!;
    reordered[idx + 1] = { ...reordered[idx]!, display_order: idx + 2 };
    reordered[idx] = { ...temp, display_order: idx + 1 };
    setFields(reordered);
    await saveOrder(reordered);
  };

  const saveOrder = async (ordered: CustomFieldDef[]) => {
    try {
      await apiClient('/api/v1/report-card-custom-field-defs/reorder', {
        method: 'PATCH',
        body: JSON.stringify({
          order: ordered.map((f, i) => ({ id: f.id, display_order: i + 1 })),
        }),
      });
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  if (editing) {
    return (
      <FieldEditor
        field={editing}
        isNew={creatingNew}
        onSave={async (updated) => {
          try {
            if (creatingNew) {
              await apiClient('/api/v1/report-card-custom-field-defs', {
                method: 'POST',
                body: JSON.stringify({
                  name: updated.name,
                  label: updated.label,
                  label_ar: updated.label_ar || null,
                  field_type: updated.field_type,
                  options_json: updated.options_json,
                  section_type: updated.section_type,
                  display_order: updated.display_order,
                }),
              });
            } else {
              await apiClient(`/api/v1/report-card-custom-field-defs/${updated.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  label: updated.label,
                  label_ar: updated.label_ar || null,
                  field_type: updated.field_type,
                  options_json: updated.options_json,
                  section_type: updated.section_type,
                }),
              });
            }
            toast.success(tc('saved'));
            setEditing(null);
            void fetchFields();
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
          <h2 className="text-lg font-semibold text-text-primary">{t('customFields')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('customFieldsDesc')}</p>
        </div>
        <Button onClick={handleCreate} className="w-full sm:w-auto">
          <Plus className="me-2 h-4 w-4" />
          {tr('addField')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
      ) : fields.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-text-tertiary">{tc('noResults')}</p>
          <Button variant="outline" onClick={handleCreate} className="mt-4">
            <Plus className="me-2 h-4 w-4" />
            {tr('addField')}
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
            >
              {/* Reorder */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => void handleMoveUp(idx)}
                  className="rounded p-0.5 text-text-tertiary hover:text-text-secondary disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={idx === fields.length - 1}
                  onClick={() => void handleMoveDown(idx)}
                  className="rounded p-0.5 text-text-tertiary hover:text-text-secondary disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{field.label}</p>
                <p className="text-xs text-text-tertiary">
                  {tr(`fieldType_${field.field_type}`)} · {tr(`sectionType_${field.section_type}`)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => handleEdit(field)}>
                  {tc('edit')}
                </Button>
                <button
                  type="button"
                  onClick={() => void handleDelete(field.id)}
                  className="rounded p-1 text-text-tertiary hover:text-error-600"
                  aria-label={tc('delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field Editor ─────────────────────────────────────────────────────────────

interface FieldEditorProps {
  field: CustomFieldDef;
  isNew: boolean;
  onSave: (updated: CustomFieldDef) => Promise<void>;
  onCancel: () => void;
}

function FieldEditor({ field, isNew, onSave, onCancel }: FieldEditorProps) {
  const tr = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [name, setName] = React.useState(field.name);
  const [label, setLabel] = React.useState(field.label);
  const [labelAr, setLabelAr] = React.useState(field.label_ar ?? '');
  const [fieldType, setFieldType] = React.useState<FieldType>(field.field_type);
  const [sectionType, setSectionType] = React.useState<SectionType>(field.section_type);
  const [options, setOptions] = React.useState<string[]>(field.options_json ?? ['']);
  const [saving, setSaving] = React.useState(false);

  const handleAddOption = () => {
    setOptions((prev) => [...prev, '']);
  };

  const handleRemoveOption = (idx: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleOptionChange = (idx: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };

  const handleSave = async () => {
    if (!label.trim()) {
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...field,
        name: name || label.toLowerCase().replace(/\s+/g, '_'),
        label,
        label_ar: labelAr || null,
        field_type: fieldType,
        section_type: sectionType,
        options_json: fieldType === 'select' ? options.filter((o) => o.trim()) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          {isNew ? tr('addField') : tr('editField')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">
            {tc('cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="w-full sm:w-auto">
            {tc('save')}
          </Button>
        </div>
      </div>

      <div className="max-w-lg rounded-2xl border border-border bg-surface p-6 space-y-4">
        {isNew && (
          <div className="space-y-1.5">
            <Label>{tr('fieldName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. conduct_rating"
              dir="ltr"
            />
            <p className="text-xs text-text-tertiary">{tr('fieldNameHint')}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{tr('fieldLabel')}</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Conduct"
          />
        </div>

        <div className="space-y-1.5">
          <Label>{tr('fieldLabelAr')}</Label>
          <Input
            value={labelAr}
            onChange={(e) => setLabelAr(e.target.value)}
            placeholder="e.g. السلوك"
            dir="rtl"
          />
        </div>

        <div className="space-y-1.5">
          <Label>{tr('fieldType')}</Label>
          <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">{tr('fieldType_text')}</SelectItem>
              <SelectItem value="select">{tr('fieldType_select')}</SelectItem>
              <SelectItem value="rating">{tr('fieldType_rating')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{tr('sectionAssignment')}</Label>
          <Select value={sectionType} onValueChange={(v) => setSectionType(v as SectionType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="conduct">{tr('sectionType_conduct')}</SelectItem>
              <SelectItem value="extracurricular">{tr('sectionType_extracurriculars')}</SelectItem>
              <SelectItem value="custom">{tr('sectionType_custom_text')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Options editor for select type */}
        {fieldType === 'select' && (
          <div className="space-y-2">
            <Label>{tr('selectOptions')}</Label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`${tr('option')} ${idx + 1}`}
                    className="flex-1"
                  />
                  {options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="shrink-0 rounded p-1 text-text-tertiary hover:text-error-600"
                      aria-label="Remove option"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={handleAddOption}>
              <Plus className="me-2 h-3.5 w-3.5" />
              {tr('addOption')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
