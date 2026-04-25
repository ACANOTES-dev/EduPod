'use client';

import { useTranslations } from 'next-intl';

import type { ComplianceFieldKey } from '@school/shared/reports';
import { Checkbox } from '@school/ui';

import {
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_FIELDS_BY_CATEGORY,
} from './compliance-field-categories';

interface ComplianceFieldChecklistProps {
  selectedFields: Set<ComplianceFieldKey>;
  onToggleField: (field: ComplianceFieldKey) => void;
  onToggleAllFields: (checked: boolean) => void;
}

export function ComplianceFieldChecklist({
  selectedFields,
  onToggleField,
  onToggleAllFields,
}: ComplianceFieldChecklistProps) {
  const t = useTranslations('reports');

  const totalFields = Object.values(COMPLIANCE_FIELDS_BY_CATEGORY).flat().length;
  const allSelected = selectedFields.size === totalFields;
  const someSelected = selectedFields.size > 0 && selectedFields.size < totalFields;

  return (
    <aside
      className="space-y-4 rounded-xl border border-border bg-surface p-4 print:hidden"
      data-testid="compliance-field-checklist"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('compliance.fieldsTitle')}</h3>
        <button
          type="button"
          onClick={() => onToggleAllFields(!allSelected)}
          className="text-xs text-primary hover:underline"
        >
          {allSelected ? t('compliance.deselectAll') : t('compliance.selectAll')}
        </button>
      </header>

      <label className="flex cursor-pointer items-center gap-3">
        <Checkbox
          checked={allSelected}
          {...(someSelected ? { 'data-state': 'indeterminate' as const } : {})}
          onCheckedChange={(checked) => onToggleAllFields(checked === true)}
          aria-label={t('compliance.toggleAll')}
        />
        <span className="text-sm font-medium text-text-primary">
          {t('compliance.allFields', { count: totalFields })}
        </span>
      </label>

      <div className="space-y-4">
        {COMPLIANCE_CATEGORIES.map((category) => {
          const fields = COMPLIANCE_FIELDS_BY_CATEGORY[category];
          return (
            <div key={category} className="space-y-2 ps-2 border-s-2 border-border">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t(`compliance.category.${category}`)}
              </p>
              <ul className="space-y-1.5">
                {fields.map((field) => (
                  <li key={field}>
                    <label className="flex cursor-pointer items-start gap-2 group">
                      <Checkbox
                        checked={selectedFields.has(field)}
                        onCheckedChange={() => onToggleField(field)}
                        className="mt-0.5"
                      />
                      <span className="text-xs leading-snug text-text-secondary group-hover:text-text-primary">
                        {t(`compliance.field.${field}`)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
