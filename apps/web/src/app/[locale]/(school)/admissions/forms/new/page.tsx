'use client';

import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { type DataMinimisationWarning, detectSpecialCategoryFields } from '@school/shared/gdpr';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
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
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Checkbox' },
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'country', label: 'Country' },
  { value: 'yes_no', label: 'Yes / No' },
];

interface FormField {
  id: string;
  field_key: string;
  label: string;
  help_text: string;
  field_type: string;
  required: boolean;
  options_json: Array<{ value: string; label: string }>;
  conditional_visibility_json: {
    depends_on_field_key: string;
    show_when_value: string;
  } | null;
  display_order: number;
  expanded: boolean;
}

function generateFieldKey(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createEmptyField(order: number): FormField {
  return {
    id: crypto.randomUUID(),
    field_key: generateFieldKey(),
    label: '',
    help_text: '',
    field_type: 'short_text',
    required: false,
    options_json: [],
    conditional_visibility_json: null,
    display_order: order,
    expanded: true,
  };
}

// ─── Field Card Component ─────────────────────────────────────────────────────

function FieldCard({
  field,
  allFields,
  warning,
  justification,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onJustify,
  isFirst,
  isLast,
}: {
  field: FormField;
  allFields: FormField[];
  warning?: DataMinimisationWarning;
  justification?: string;
  onUpdate: (updated: FormField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onJustify: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const showOptions = field.field_type === 'single_select' || field.field_type === 'multi_select';

  const otherFields = allFields.filter((f) => f.id !== field.id);

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <GripVertical className="h-4 w-4 shrink-0 text-text-tertiary" />
        <span className="flex-1 truncate text-sm font-medium text-text-primary">
          {field.label || 'Untitled field'}
        </span>
        {warning && (
          <span className="flex items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-xs text-warning-text">
            <ShieldAlert className="h-3 w-3" />
            DPC Warning
          </span>
        )}
        <span className="text-xs text-text-tertiary">{field.field_type}</span>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onMoveUp} disabled={isFirst}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onMoveDown} disabled={isLast}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onUpdate({ ...field, expanded: !field.expanded })}
          >
            {field.expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-danger-text" />
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {field.expanded && (
        <div className="space-y-4 p-4">
          {warning && (
            <div className="rounded-lg border border-warning-border bg-warning-surface p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-warning-text">Data Minimisation Warning</p>
                  <p className="mt-1 text-xs text-warning-text/80">
                    The DPC advises against collecting {warning.category.replace('_', ' ')} data at
                    the pre-enrolment stage. This type of information should only be collected
                    post-enrolment with explicit consent.
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    Matched keyword: &quot;{warning.matched_keyword}&quot;
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" size="sm" onClick={onRemove}>
                      Remove Field
                    </Button>
                    <Button variant="outline" size="sm" onClick={onJustify}>
                      {justification ? 'Edit Justification' : 'Keep with Justification'}
                    </Button>
                  </div>
                  {justification && (
                    <div className="mt-2 rounded bg-surface-secondary p-2">
                      <p className="text-xs text-text-secondary">
                        <span className="font-medium">Justification:</span> {justification}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Label */}
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={field.label}
                onChange={(e) => onUpdate({ ...field, label: e.target.value })}
                placeholder="Field label"
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Field Type</Label>
              <Select
                value={field.field_type}
                onValueChange={(val) => onUpdate({ ...field, field_type: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>
                      {ft.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Help text */}
          <div className="space-y-1.5">
            <Label>Help Text</Label>
            <Input
              value={field.help_text}
              onChange={(e) => onUpdate({ ...field, help_text: e.target.value })}
              placeholder="Optional help text shown below the field"
            />
          </div>

          {/* Required toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`required-${field.id}`}
              checked={field.required}
              onCheckedChange={(checked) => onUpdate({ ...field, required: Boolean(checked) })}
            />
            <Label htmlFor={`required-${field.id}`} className="text-sm">
              Required
            </Label>
          </div>

          {/* Options for select types */}
          {showOptions && (
            <div className="space-y-2">
              <Label>Options</Label>
              {field.options_json.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={opt.label}
                    onChange={(e) => {
                      const updated = [...field.options_json];
                      updated[idx] = {
                        value: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                        label: e.target.value,
                      };
                      onUpdate({ ...field, options_json: updated });
                    }}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const updated = field.options_json.filter((_, i) => i !== idx);
                      onUpdate({ ...field, options_json: updated });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger-text" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onUpdate({
                    ...field,
                    options_json: [...field.options_json, { value: '', label: '' }],
                  })
                }
              >
                <Plus className="me-1 h-3.5 w-3.5" />
                Add Option
              </Button>
            </div>
          )}

          {/* Conditional visibility */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`conditional-${field.id}`}
                checked={field.conditional_visibility_json !== null}
                onCheckedChange={(checked) =>
                  onUpdate({
                    ...field,
                    conditional_visibility_json: checked
                      ? { depends_on_field_key: '', show_when_value: '' }
                      : null,
                  })
                }
              />
              <Label htmlFor={`conditional-${field.id}`} className="text-sm">
                Conditional visibility
              </Label>
            </div>

            {field.conditional_visibility_json && (
              <div className="ms-6 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Depends on field</Label>
                  <Select
                    value={field.conditional_visibility_json.depends_on_field_key}
                    onValueChange={(val) =>
                      onUpdate({
                        ...field,
                        conditional_visibility_json: {
                          ...field.conditional_visibility_json!,
                          depends_on_field_key: val,
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherFields.map((f) => (
                        <SelectItem key={f.field_key} value={f.field_key}>
                          {f.label || f.field_key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Show when value is</Label>
                  <Input
                    value={field.conditional_visibility_json.show_when_value}
                    onChange={(e) =>
                      onUpdate({
                        ...field,
                        conditional_visibility_json: {
                          ...field.conditional_visibility_json!,
                          show_when_value: e.target.value,
                        },
                      })
                    }
                    placeholder="Value"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewAdmissionFormPage() {
  const t = useTranslations('admissions');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [formName, setFormName] = React.useState('');
  const [fields, setFields] = React.useState<FormField[]>([]);
  const [saving, setSaving] = React.useState(false);

  // ─── Data Minimisation Warning State ──────────────────────────────────────
  const [dataMinWarnings, setDataMinWarnings] = React.useState<DataMinimisationWarning[]>([]);
  const [justifications, setJustifications] = React.useState<Record<string, string>>({});
  const [justificationDialogField, setJustificationDialogField] =
    React.useState<DataMinimisationWarning | null>(null);
  const [justificationText, setJustificationText] = React.useState('');

  React.useEffect(() => {
    const warnings = detectSpecialCategoryFields(
      fields.map((f) => ({ field_key: f.field_key, label: f.label })),
    );
    setDataMinWarnings(warnings);
  }, [fields]);

  const openJustificationDialog = (warning: DataMinimisationWarning) => {
    setJustificationText(justifications[warning.field_key] ?? '');
    setJustificationDialogField(warning);
  };

  const handleAddField = () => {
    setFields((prev) => [...prev, createEmptyField(prev.length + 1)]);
  };

  const handleUpdateField = (id: string, updated: FormField) => {
    setFields((prev) => prev.map((f) => (f.id === id ? updated : f)));
  };

  const handleRemoveField = (id: string) => {
    setFields((prev) =>
      prev.filter((f) => f.id !== id).map((f, idx) => ({ ...f, display_order: idx + 1 })),
    );
  };

  const handleMoveUp = (idx: number) => {
    if (idx === 0) return;
    setFields((prev) => {
      const next = [...prev];
      const a = next[idx - 1] as FormField;
      const b = next[idx] as FormField;
      next[idx - 1] = b;
      next[idx] = a;
      return next.map((f, i) => ({ ...f, display_order: i + 1 }));
    });
  };

  const handleMoveDown = (idx: number) => {
    if (idx >= fields.length - 1) return;
    setFields((prev) => {
      const next = [...prev];
      const a = next[idx] as FormField;
      const b = next[idx + 1] as FormField;
      next[idx] = b;
      next[idx + 1] = a;
      return next.map((f, i) => ({ ...f, display_order: i + 1 }));
    });
  };

  const handleSave = async (publish: boolean) => {
    if (!formName.trim()) {
      toast.error('Form name is required');
      return;
    }

    // Check unjustified special category fields
    const unjustified = dataMinWarnings.filter((w) => !justifications[w.field_key]);
    if (unjustified.length > 0) {
      toast.error(
        `${unjustified.length} flagged field${unjustified.length !== 1 ? 's' : ''} require justification before saving.`,
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName,
        status: publish ? 'published' : 'draft',
        fields: fields.map(({ id: _id, expanded: _expanded, ...rest }) => rest),
      };
      const created = await apiClient<{ id: string }>('/api/v1/admission-forms', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Log data minimisation overrides to audit trail after creation
      if (dataMinWarnings.length > 0 && Object.keys(justifications).length > 0 && created?.id) {
        apiClient(`/api/v1/admission-forms/${created.id}/validate-fields`, {
          method: 'POST',
          body: JSON.stringify({
            fields: fields.map((f) => ({ field_key: f.field_key, label: f.label })),
            justifications,
          }),
        }).catch(console.error);
      }

      toast.success(publish ? 'Form published' : 'Draft saved');
      router.push(`/${locale}/admissions/forms`);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('newForm')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {tc('back')}
            </Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              {t('saveDraft')}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving}>
              {t('publish')}
            </Button>
          </div>
        }
      />

      {/* Form name */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="space-y-1.5">
          <Label>{t('formName')}</Label>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. General Admission 2026-27"
          />
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Fields</h2>
          <Button variant="outline" onClick={handleAddField}>
            <Plus className="me-2 h-4 w-4" />
            {t('addField')}
          </Button>
        </div>

        {fields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-secondary p-12 text-center">
            <p className="text-sm text-text-tertiary">
              No fields yet. Click &quot;Add Field&quot; to start building your form.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, idx) => {
              const warning = dataMinWarnings.find((w) => w.field_key === field.field_key);
              return (
                <FieldCard
                  key={field.id}
                  field={field}
                  allFields={fields}
                  warning={warning}
                  justification={warning ? justifications[field.field_key] : undefined}
                  onUpdate={(updated) => handleUpdateField(field.id, updated)}
                  onRemove={() => handleRemoveField(field.id)}
                  onMoveUp={() => handleMoveUp(idx)}
                  onMoveDown={() => handleMoveDown(idx)}
                  onJustify={() => warning && openJustificationDialog(warning)}
                  isFirst={idx === 0}
                  isLast={idx === fields.length - 1}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Data Minimisation Summary */}
      {dataMinWarnings.length > 0 && (
        <div className="rounded-xl border border-warning-border bg-warning-surface p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-text" />
            <div>
              <p className="text-sm font-medium text-warning-text">
                This form contains {dataMinWarnings.length} field
                {dataMinWarnings.length !== 1 ? 's' : ''} flagged for data minimisation review:
              </p>
              <ul className="mt-2 space-y-1">
                {dataMinWarnings.map((w) => (
                  <li
                    key={w.field_key}
                    className="flex items-center gap-2 text-xs text-warning-text/80"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning-text" />
                    &quot;{w.field_label}&quot; ({w.category.replace('_', ' ')} data)
                    {justifications[w.field_key] ? (
                      <span className="text-success-text">— justified</span>
                    ) : (
                      <span className="text-danger-text">— needs justification</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Justification Dialog */}
      <Dialog
        open={!!justificationDialogField}
        onOpenChange={(open) => {
          if (!open) setJustificationDialogField(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Justify Special Category Field</DialogTitle>
            <DialogDescription>
              Field &quot;{justificationDialogField?.field_label}&quot; contains a{' '}
              {justificationDialogField?.category.replace('_', ' ')} keyword. Please provide a
              justification for including this field in the pre-enrolment form.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Justification (required)</Label>
            <Textarea
              value={justificationText}
              onChange={(e) => setJustificationText(e.target.value)}
              placeholder="Explain why this field is necessary at the pre-enrolment stage..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJustificationDialogField(null)}>
              Cancel
            </Button>
            <Button
              disabled={!justificationText.trim()}
              onClick={() => {
                if (justificationDialogField && justificationText.trim()) {
                  setJustifications((prev) => ({
                    ...prev,
                    [justificationDialogField.field_key]: justificationText.trim(),
                  }));
                  setJustificationDialogField(null);
                  setJustificationText('');
                }
              }}
            >
              Save Justification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
