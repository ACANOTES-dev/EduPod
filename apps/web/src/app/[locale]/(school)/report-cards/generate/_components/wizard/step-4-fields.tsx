'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { PersonalInfoField } from '@school/shared';
import { Checkbox, Label } from '@school/ui';

import { PERSONAL_INFO_FIELD_SECTIONS, type WizardAction, type WizardState } from './types';

interface Step4Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Step 4 — Personal info fields ───────────────────────────────────────────

export function Step4Fields({ state, dispatch }: Step4Props) {
  const t = useTranslations('reportCards.wizard');

  const toggle = React.useCallback(
    (field: PersonalInfoField) => {
      dispatch({ type: 'TOGGLE_FIELD', field });
    },
    [dispatch],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {PERSONAL_INFO_FIELD_SECTIONS.map((section) => (
          <div key={section.key} className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {t(`fieldSection${section.key[0]!.toUpperCase()}${section.key.slice(1)}`)}
            </Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {section.fields.map((field) => {
                const checked = state.personalInfoFields.includes(field);
                return (
                  <label
                    key={field}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-primary-300"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(field)} />
                    <span className="text-sm text-text-primary">{t(`field_${field}`)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Live preview */}
      <div className="h-fit space-y-2 rounded-2xl border border-border bg-surface-secondary/40 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          {t('fieldSelectedPreview')}
        </div>
        <ul className="space-y-1 text-sm text-text-primary">
          {state.personalInfoFields.length === 0 ? (
            <li className="text-xs text-text-tertiary">—</li>
          ) : (
            state.personalInfoFields.map((field) => (
              <li key={field} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                {t(`field_${field}`)}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
