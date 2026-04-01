'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  GripVertical,
  Plus,
  Save,
  SendHorizonal,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';

import {
  createEngagementFormTemplateSchema,
  type CreateEngagementFormTemplateDto,
  type EngagementFormField,
} from '@school/shared';
import {
  Button,
  Checkbox,
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


import {
  CONSENT_TYPE_OPTIONS,
  FORM_TYPE_OPTIONS,
  createEmptyField,
  type AcademicYearOption,
  type FormTemplateRecord,
  type PaginatedResponse,
} from './engagement-types';
import { FormFieldRenderer } from './form-field-renderer';

import { apiClient } from '@/lib/api-client';

function normaliseField(field: EngagementFormField, index: number): EngagementFormField {
  return {
    ...field,
    display_order: index,
    help_text: {
      en: field.help_text?.en ?? '',
      ar: field.help_text?.ar ?? '',
    },
    options_json: Array.isArray(field.options_json) ? field.options_json : [],
  };
}

function buildDefaultValues(template?: FormTemplateRecord | null): CreateEngagementFormTemplateDto {
  return {
    name: template?.name ?? '',
    description: template?.description ?? '',
    form_type: template?.form_type ?? 'consent_form',
    consent_type:
      template?.consent_type ?? (template?.form_type === 'consent_form' ? 'one_time' : undefined),
    fields_json: template?.fields_json?.length
      ? template.fields_json.map((field, index) => normaliseField(field, index))
      : [createEmptyField(0)],
    requires_signature: template?.requires_signature ?? false,
    academic_year_id: template?.academic_year_id ?? undefined,
  };
}

interface FormTemplateEditorProps {
  mode: 'create' | 'edit';
  template?: FormTemplateRecord | null;
}

export function FormTemplateEditor({ mode, template = null }: FormTemplateEditorProps) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('engagement');
  const tCommon = useTranslations('common');
  const [academicYears, setAcademicYears] = React.useState<AcademicYearOption[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitIntent, setSubmitIntent] = React.useState<'save' | 'publish'>('save');

  const form = useForm<CreateEngagementFormTemplateDto>({
    resolver: zodResolver(createEngagementFormTemplateSchema),
    defaultValues: buildDefaultValues(template),
  });

  const fieldArray = useFieldArray({
    control: form.control,
    name: 'fields_json',
  });

  const watchedFormType = form.watch('form_type');
  const watchedFields = form.watch('fields_json');
  const watchedValues = React.useMemo(() => {
    return Object.fromEntries(
      (watchedFields ?? []).map((field) => [
        field.field_key,
        field.field_type === 'multi_select' ? [] : '',
      ]),
    );
  }, [watchedFields]);

  React.useEffect(() => {
    form.reset(buildDefaultValues(template));
  }, [form, template]);

  React.useEffect(() => {
    apiClient<PaginatedResponse<AcademicYearOption>>('/api/v1/academic-years?page=1&pageSize=100')
      .then((response) => setAcademicYears(response.data))
      .catch((error) => {
        console.error('[FormTemplateEditor.loadAcademicYears]', error);
      });
  }, []);

  const handleAddField = React.useCallback(() => {
    fieldArray.append(createEmptyField(fieldArray.fields.length));
  }, [fieldArray]);

  const updateFieldOptions = React.useCallback(
    (index: number, nextOptions: Array<{ value: string; label: string }>) => {
      form.setValue(`fields_json.${index}.options_json`, nextOptions, {
        shouldDirty: true,
        shouldTouch: true,
      });
    },
    [form],
  );

  const updateConditionalVisibility = React.useCallback(
    (index: number, patch: Record<string, string>) => {
      const currentValue = form.getValues(`fields_json.${index}.conditional_visibility_json`) ?? {};

      form.setValue(
        `fields_json.${index}.conditional_visibility_json`,
        {
          ...(typeof currentValue === 'object' && currentValue ? currentValue : {}),
          ...patch,
        },
        {
          shouldDirty: true,
          shouldTouch: true,
        },
      );
    },
    [form],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    if (values.fields_json.length === 0) {
      toast.error(t('builder.atLeastOneField'));
      return;
    }

    setSubmitting(true);

    try {
      const payload: CreateEngagementFormTemplateDto = {
        ...values,
        consent_type: values.form_type === 'consent_form' ? values.consent_type : undefined,
        academic_year_id: values.academic_year_id || undefined,
        fields_json: values.fields_json.map((field, index) => normaliseField(field, index)),
      };

      const savedTemplate =
        mode === 'create'
          ? await apiClient<FormTemplateRecord>('/api/v1/engagement/form-templates', {
              method: 'POST',
              body: JSON.stringify(payload),
            })
          : await apiClient<FormTemplateRecord>(
              `/api/v1/engagement/form-templates/${template?.id ?? ''}`,
              {
                method: 'PATCH',
                body: JSON.stringify(payload),
              },
            );

      if (submitIntent === 'publish') {
        await apiClient<FormTemplateRecord>(
          `/api/v1/engagement/form-templates/${savedTemplate.id}/publish`,
          {
            method: 'POST',
          },
        );
      }

      toast.success(
        submitIntent === 'publish' ? t('builder.publishSuccess') : t('builder.saveSuccess'),
      );
      router.push(`/${locale}/engagement/form-templates/${savedTemplate.id}`);
    } catch (error) {
      console.error('[FormTemplateEditor.onSubmit]', error);
      toast.error(submitIntent === 'publish' ? t('builder.publishError') : t('builder.saveError'));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="template-name">{t('builder.name')}</Label>
                <Input id="template-name" {...form.register('name')} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="template-description">{t('builder.description')}</Label>
                <Textarea
                  id="template-description"
                  className="min-h-24"
                  {...form.register('description')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('builder.formType')}</Label>
                <Controller
                  control={form.control}
                  name="form_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORM_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(`formTypes.${option.label}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('builder.academicYear')}</Label>
                <Controller
                  control={form.control}
                  name="academic_year_id"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(nextValue) =>
                        field.onChange(nextValue === '__none__' ? undefined : nextValue)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('builder.selectAcademicYear')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t('builder.noAcademicYear')}</SelectItem>
                        {academicYears.map((year) => (
                          <SelectItem key={year.id} value={year.id}>
                            {year.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {watchedFormType === 'consent_form' ? (
                <div className="space-y-2">
                  <Label>{t('builder.consentType')}</Label>
                  <Controller
                    control={form.control}
                    name="consent_type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONSENT_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(`consentTypes.${option.label}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              ) : null}

              <div className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
                <Controller
                  control={form.control}
                  name="requires_signature"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                    />
                  )}
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {t('builder.requiresSignature')}
                  </p>
                  <p className="text-xs text-text-tertiary">{t('builder.requiresSignatureHint')}</p>
                </div>
              </div>
            </div>
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('builder.fields')}</h2>
                <p className="text-sm text-text-secondary">{t('builder.fieldsDescription')}</p>
              </div>
              <Button type="button" variant="outline" onClick={handleAddField}>
                <Plus className="me-2 h-4 w-4" />
                {t('builder.addField')}
              </Button>
            </div>

            {fieldArray.fields.map((fieldItem, index) => {
              const fieldType = form.watch(`fields_json.${index}.field_type`);
              const showOptions = fieldType === 'single_select' || fieldType === 'multi_select';
              const fieldOptions = Array.isArray(form.watch(`fields_json.${index}.options_json`))
                ? (form.watch(`fields_json.${index}.options_json`) as Array<{
                    value: string;
                    label: string;
                  }>)
                : [];
              const conditionalConfig =
                (form.watch(`fields_json.${index}.conditional_visibility_json`) as Record<
                  string,
                  string
                > | null) ?? null;

              return (
                <article
                  key={fieldItem.id}
                  className="rounded-3xl border border-border bg-surface p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-surface-secondary p-2 text-text-tertiary">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">
                          {form.watch(`fields_json.${index}.label.en`) ||
                            t('builder.untitledField')}
                        </p>
                        <p className="text-xs text-text-tertiary">{t(`fieldTypes.${fieldType}`)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === 0}
                        onClick={() => fieldArray.move(index, index - 1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === fieldArray.fields.length - 1}
                        onClick={() => fieldArray.move(index, index + 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => fieldArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4 text-danger-text" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t('builder.fieldLabelEn')}</Label>
                      <Input {...form.register(`fields_json.${index}.label.en`)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('builder.fieldLabelAr')}</Label>
                      <Input dir="rtl" {...form.register(`fields_json.${index}.label.ar`)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('builder.fieldHelpEn')}</Label>
                      <Textarea
                        className="min-h-20"
                        {...form.register(`fields_json.${index}.help_text.en`)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('builder.fieldHelpAr')}</Label>
                      <Textarea
                        dir="rtl"
                        className="min-h-20"
                        {...form.register(`fields_json.${index}.help_text.ar`)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('builder.fieldKey')}</Label>
                      <Input {...form.register(`fields_json.${index}.field_key`)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('builder.fieldType')}</Label>
                      <Controller
                        control={form.control}
                        name={`fields_json.${index}.field_type`}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[
                                'short_text',
                                'long_text',
                                'number',
                                'date',
                                'boolean',
                                'single_select',
                                'multi_select',
                                'phone',
                                'email',
                                'country',
                                'yes_no',
                                'signature',
                                'file_upload',
                                'info_block',
                              ].map((option) => (
                                <SelectItem key={option} value={option}>
                                  {t(`fieldTypes.${option}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
                    <Controller
                      control={form.control}
                      name={`fields_json.${index}.required`}
                      render={({ field }) => (
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                        />
                      )}
                    />
                    <span className="text-sm font-medium text-text-primary">
                      {t('builder.requiredField')}
                    </span>
                  </div>

                  {showOptions ? (
                    <div className="mt-4 space-y-3 rounded-2xl border border-border bg-surface-secondary/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-text-primary">{t('builder.options')}</p>
                          <p className="text-xs text-text-tertiary">{t('builder.optionsHint')}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateFieldOptions(index, [
                              ...fieldOptions,
                              {
                                value: `option_${fieldOptions.length + 1}`,
                                label: '',
                              },
                            ])
                          }
                        >
                          <Plus className="me-2 h-3.5 w-3.5" />
                          {t('builder.addOption')}
                        </Button>
                      </div>
                      {fieldOptions.map((option, optionIndex) => (
                        <div key={`${fieldItem.id}-option-${optionIndex}`} className="flex gap-2">
                          <Input
                            value={option.label}
                            onChange={(event) => {
                              const nextOptions = [...fieldOptions];
                              nextOptions[optionIndex] = {
                                value: event.target.value
                                  .trim()
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, '_'),
                                label: event.target.value,
                              };
                              updateFieldOptions(index, nextOptions);
                            }}
                            placeholder={t('builder.optionPlaceholder')}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              updateFieldOptions(
                                index,
                                fieldOptions.filter(
                                  (_, currentIndex) => currentIndex !== optionIndex,
                                ),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4 text-danger-text" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t('builder.dependsOnField')}</Label>
                      <Select
                        value={conditionalConfig?.depends_on_field_key ?? '__none__'}
                        onValueChange={(nextValue) => {
                          if (nextValue === '__none__') {
                            form.setValue(
                              `fields_json.${index}.conditional_visibility_json`,
                              undefined,
                              {
                                shouldDirty: true,
                                shouldTouch: true,
                              },
                            );
                            return;
                          }

                          updateConditionalVisibility(index, {
                            depends_on_field_key: nextValue,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('builder.noCondition')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('builder.noCondition')}</SelectItem>
                          {fieldArray.fields
                            .filter((candidate) => candidate.id !== fieldItem.id)
                            .map((candidate, candidateIndex) => (
                              <SelectItem
                                key={candidate.id}
                                value={form.getValues(`fields_json.${candidateIndex}.field_key`)}
                              >
                                {form.getValues(`fields_json.${candidateIndex}.label.en`) ||
                                  t('builder.untitledField')}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('builder.showWhenValue')}</Label>
                      <Input
                        value={conditionalConfig?.show_when_value ?? ''}
                        onChange={(event) =>
                          updateConditionalVisibility(index, {
                            show_when_value: event.target.value,
                          })
                        }
                        placeholder={t('builder.showWhenValuePlaceholder')}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-text-primary">{t('builder.livePreview')}</h2>
            </div>
            <p className="mt-1 text-sm text-text-secondary">{t('builder.livePreviewHint')}</p>

            <div className="mt-5 space-y-4">
              {watchedFields.map((field) => (
                <FormFieldRenderer
                  key={field.id}
                  field={field}
                  locale={locale}
                  preview
                  values={watchedValues}
                />
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="space-y-3">
              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
                onClick={() => setSubmitIntent('save')}
              >
                <Save className="me-2 h-4 w-4" />
                {submitting && submitIntent === 'save'
                  ? t('builder.saving')
                  : mode === 'create'
                    ? t('builder.saveDraft')
                    : tCommon('save')}
              </Button>
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={submitting}
                onClick={() => setSubmitIntent('publish')}
              >
                <SendHorizonal className="me-2 h-4 w-4" />
                {submitting && submitIntent === 'publish'
                  ? t('builder.publishing')
                  : t('builder.publish')}
              </Button>
            </div>
          </section>
        </aside>
      </section>
    </form>
  );
}
