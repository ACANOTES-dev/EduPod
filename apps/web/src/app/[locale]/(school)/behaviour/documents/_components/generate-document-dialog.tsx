'use client';

import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
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
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import {
  DOCUMENT_ENTITY_TYPES,
  DOCUMENT_TYPES,
  type DocumentEntityType,
  type DocumentRow,
  type DocumentTemplate,
  type DocumentType,
} from './document-types';

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (doc: DocumentRow) => void;
  /** Optional: pre-seed the entity picker from a referring surface. */
  defaultEntityType?: DocumentEntityType;
  defaultEntityId?: string;
}

type Step = 1 | 2 | 3 | 4;

interface FormState {
  document_type: DocumentType;
  template_id: string | null;
  entity_type: DocumentEntityType;
  entity_id: string;
  locale: string;
  overrides: Record<string, string>;
}

const INITIAL_FORM: FormState = {
  document_type: 'detention_notice',
  template_id: null,
  entity_type: 'incident',
  entity_id: '',
  locale: 'en',
  overrides: {},
};

export function GenerateDocumentDialog({
  open,
  onOpenChange,
  onGenerated,
  defaultEntityType,
  defaultEntityId,
}: GenerateDialogProps) {
  const t = useTranslations('documentGen.generate');
  const tTypes = useTranslations('documentGen.types');
  const tEntities = useTranslations('documentGen.entityTypes');

  const [step, setStep] = React.useState<Step>(1);
  const [form, setForm] = React.useState<FormState>({
    ...INITIAL_FORM,
    entity_type: defaultEntityType ?? INITIAL_FORM.entity_type,
    entity_id: defaultEntityId ?? '',
  });
  const [templates, setTemplates] = React.useState<DocumentTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset state each time the dialog opens so a stale step/error doesn't carry
  // over between generations.
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setForm({
        ...INITIAL_FORM,
        entity_type: defaultEntityType ?? INITIAL_FORM.entity_type,
        entity_id: defaultEntityId ?? '',
      });
      setError(null);
    }
  }, [open, defaultEntityType, defaultEntityId]);

  // Pull templates for the currently-selected document type whenever step 1
  // is active. The controller lists them gated by `behaviour.view` — the
  // picker is read-only here.
  React.useEffect(() => {
    if (!open || step !== 1) return;
    let cancelled = false;
    setTemplatesLoading(true);
    apiClient<{ data: DocumentTemplate[] }>(
      `/api/v1/behaviour/documents/templates?document_type=${form.document_type}&is_active=true`,
    )
      .then((res) => {
        if (cancelled) return;
        setTemplates(res.data ?? []);
        // Pre-select the first system template in the current UI locale when
        // nothing is selected yet.
        setForm((prev) => {
          if (prev.template_id) return prev;
          const preferred =
            res.data.find((tmpl) => tmpl.is_system && tmpl.locale === prev.locale) ??
            res.data.find((tmpl) => tmpl.is_system) ??
            res.data[0];
          return preferred ? { ...prev, template_id: preferred.id } : prev;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[GenerateDocumentDialog.listTemplates]', err);
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step, form.document_type]);

  const selectedTemplate = templates.find((tmpl) => tmpl.id === form.template_id) ?? null;

  const updateOverride = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, overrides: { ...prev.overrides, [field]: value } }));
  };

  // Step transition guards — each step validates just enough to move forward.
  const canAdvance = (): boolean => {
    if (step === 1) return !!form.template_id;
    if (step === 2) return isValidUuid(form.entity_id);
    if (step === 3) return true;
    return true;
  };

  const next = () => {
    if (step < 4) setStep((step + 1) as Step);
  };
  const prev = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const submit = async () => {
    if (!form.template_id || !isValidUuid(form.entity_id)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient<{ data: DocumentRow }>('/api/v1/behaviour/documents/generate', {
        method: 'POST',
        body: JSON.stringify({
          document_type: form.document_type,
          entity_type: form.entity_type,
          entity_id: form.entity_id,
          template_id: form.template_id,
          locale: form.locale,
        }),
        silent: true,
      });
      toast.success(t('successToast'));
      onGenerated(res.data);
      onOpenChange(false);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string; code?: string }; message?: string };
      setError(ex?.error?.message ?? ex?.message ?? t('errorFallback'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('stepLabel', { step, total: 4 })}</DialogDescription>
        </DialogHeader>

        <div className="mb-2 flex items-center gap-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              aria-label={t('stepLabel', { step: n, total: 4 })}
              className={`h-1.5 flex-1 rounded-full ${
                n <= step ? 'bg-accent' : 'bg-surface-secondary'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <Step1TemplatePicker
            form={form}
            templates={templates}
            templatesLoading={templatesLoading}
            onDocumentTypeChange={(value) =>
              setForm((prev) => ({ ...prev, document_type: value, template_id: null }))
            }
            onTemplateSelect={(templateId) =>
              setForm((prev) => ({ ...prev, template_id: templateId }))
            }
            onLocaleChange={(locale) => setForm((prev) => ({ ...prev, locale }))}
          />
        )}

        {step === 2 && (
          <Step2EntityPicker
            form={form}
            onEntityTypeChange={(value) =>
              setForm((prev) => ({ ...prev, entity_type: value, entity_id: '' }))
            }
            onEntityIdChange={(value) => setForm((prev) => ({ ...prev, entity_id: value.trim() }))}
          />
        )}

        {step === 3 && (
          <Step3Overrides
            template={selectedTemplate}
            overrides={form.overrides}
            onOverrideChange={updateOverride}
          />
        )}

        {step === 4 && (
          <Step4Confirm
            form={form}
            template={selectedTemplate}
            documentTypeLabel={tTypes(form.document_type)}
            entityTypeLabel={tEntities(form.entity_type)}
          />
        )}

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text"
          >
            {error}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={prev} disabled={submitting}>
                <ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" />
                {t('back')}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t('cancel')}
            </Button>
            {step < 4 ? (
              <Button onClick={next} disabled={!canAdvance()}>
                {t('next')}
                <ArrowRight className="ms-1 h-4 w-4 rtl:rotate-180" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="me-1 h-4 w-4 animate-spin" aria-hidden />
                    {t('generating')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="me-1 h-4 w-4" aria-hidden />
                    {t('generate')}
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step components ──────────────────────────────────────────────────────────

interface Step1Props {
  form: FormState;
  templates: DocumentTemplate[];
  templatesLoading: boolean;
  onDocumentTypeChange: (value: DocumentType) => void;
  onTemplateSelect: (templateId: string) => void;
  onLocaleChange: (locale: string) => void;
}

function Step1TemplatePicker({
  form,
  templates,
  templatesLoading,
  onDocumentTypeChange,
  onTemplateSelect,
  onLocaleChange,
}: Step1Props) {
  const t = useTranslations('documentGen.generate');
  const tTypes = useTranslations('documentGen.types');

  return (
    <div className="space-y-4 py-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t('documentType')}</Label>
          <Select
            value={form.document_type}
            onValueChange={(value) => onDocumentTypeChange(value as DocumentType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {tTypes(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('locale')}</Label>
          <Select value={form.locale} onValueChange={onLocaleChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* eslint-disable school/no-untranslated-strings -- language names stay in their own script */}
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
              {/* eslint-enable school/no-untranslated-strings */}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('pickTemplate')}</Label>
        {templatesLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <p className="rounded-md bg-surface-secondary p-4 text-center text-sm text-text-tertiary">
            {t('noTemplates')}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((tmpl) => {
              const selected = tmpl.id === form.template_id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => onTemplateSelect(tmpl.id)}
                  className={`rounded-lg border p-3 text-start transition-colors ${
                    selected
                      ? 'border-accent bg-accent/5 ring-1 ring-accent'
                      : 'border-border hover:bg-surface-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-text-tertiary" />
                    <span className="truncate text-sm font-medium text-text-primary">
                      {tmpl.name}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-text-tertiary">
                    <span className="font-mono uppercase">{tmpl.locale}</span>
                    {tmpl.is_system && (
                      <span className="rounded bg-surface-secondary px-1.5 py-0.5 font-medium text-text-secondary">
                        {t('systemTemplate')}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface Step2Props {
  form: FormState;
  onEntityTypeChange: (value: DocumentEntityType) => void;
  onEntityIdChange: (value: string) => void;
}

function Step2EntityPicker({ form, onEntityTypeChange, onEntityIdChange }: Step2Props) {
  const t = useTranslations('documentGen.generate');
  const tEntities = useTranslations('documentGen.entityTypes');
  const valid = form.entity_id === '' || isValidUuid(form.entity_id);

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label>{t('entityType')}</Label>
        <Select
          value={form.entity_type}
          onValueChange={(value) => onEntityTypeChange(value as DocumentEntityType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_ENTITY_TYPES.map((entity) => (
              <SelectItem key={entity} value={entity}>
                {tEntities(entity)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t('entityId')}</Label>
        <Input
          value={form.entity_id}
          onChange={(e) => onEntityIdChange(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          className="font-mono text-sm"
          aria-invalid={!valid}
        />
        {!valid && <p className="text-xs text-danger-text">{t('entityIdInvalid')}</p>}
        <p className="text-xs text-text-tertiary">{t('entityIdHint')}</p>
      </div>
    </div>
  );
}

interface Step3Props {
  template: DocumentTemplate | null;
  overrides: Record<string, string>;
  onOverrideChange: (field: string, value: string) => void;
}

function Step3Overrides({ template, overrides, onOverrideChange }: Step3Props) {
  const t = useTranslations('documentGen.generate');
  if (!template) {
    return (
      <p className="py-6 text-center text-sm text-text-tertiary">{t('overridesNoTemplate')}</p>
    );
  }
  if (template.merge_fields.length === 0) {
    return <p className="py-6 text-center text-sm text-text-tertiary">{t('overridesNoFields')}</p>;
  }
  return (
    <div className="max-h-80 space-y-3 overflow-y-auto py-2 pe-2">
      <p className="text-sm text-text-secondary">{t('overridesHint')}</p>
      {template.merge_fields.map((field) => (
        <div key={field.field_name} className="space-y-1">
          <Label className="text-xs">
            <span className="font-mono">{field.field_name}</span>
            <span className="ms-2 text-text-tertiary">{field.description}</span>
          </Label>
          <Input
            value={overrides[field.field_name] ?? ''}
            onChange={(e) => onOverrideChange(field.field_name, e.target.value)}
            placeholder={t('overrideUseDefault')}
            className="text-sm"
          />
        </div>
      ))}
    </div>
  );
}

interface Step4Props {
  form: FormState;
  template: DocumentTemplate | null;
  documentTypeLabel: string;
  entityTypeLabel: string;
}

function Step4Confirm({ form, template, documentTypeLabel, entityTypeLabel }: Step4Props) {
  const t = useTranslations('documentGen.generate');
  const overrideKeys = Object.keys(form.overrides).filter((k) => form.overrides[k]);
  return (
    <div className="space-y-3 py-2 text-sm">
      <p className="text-text-secondary">{t('confirmHint')}</p>
      <dl className="grid gap-2 rounded-lg border border-border bg-surface-secondary p-3">
        <Row label={t('documentType')} value={documentTypeLabel} />
        <Row label={t('pickTemplate')} value={template?.name ?? '—'} />
        <Row label={t('locale')} value={form.locale.toUpperCase()} />
        <Row label={t('entityType')} value={entityTypeLabel} />
        <Row label={t('entityId')} value={form.entity_id} mono />
        <Row
          label={t('overridesSummary')}
          value={
            overrideKeys.length === 0
              ? t('overridesNone')
              : t('overridesCount', { count: overrideKeys.length })
          }
        />
      </dl>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd className={`text-sm text-text-primary ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}
