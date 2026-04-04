'use client';

import { useTranslations } from 'next-intl';

import { GradebookSettings } from './settings-types';
import { BooleanRow, NumberRow, SectionCard, SelectRow, SubSectionCard, TextRow } from './settings-ui';

interface GradebookSectionProps {
  settings: GradebookSettings;
  onChange: (updates: Partial<GradebookSettings>) => void;
}

export function GradebookSection({ settings, onChange }: GradebookSectionProps) {
  const t = useTranslations('settings');

  return (
    <SectionCard title={t('sectionGradebook')} description={t('sectionGradebookDesc')}>
      <SelectRow
        label={t('defaultMissingGradePolicy')}
        value={settings.defaultMissingGradePolicy}
        options={[
          { value: 'exclude', label: t('policyExclude') },
          { value: 'zero', label: t('policyZero') },
        ]}
        onChange={(v) =>
          onChange({ defaultMissingGradePolicy: v as 'exclude' | 'zero' })
        }
      />
      <BooleanRow
        label={t('requireGradeComment')}
        value={settings.requireGradeComment}
        onChange={(v) => onChange({ requireGradeComment: v })}
      />
      <NumberRow
        label={t('formativeWeightCap')}
        description={t('formativeWeightCapDesc')}
        value={settings.formativeWeightCap}
        onChange={(v) => onChange({ formativeWeightCap: v })}
        min={0}
        max={100}
        nullable
      />
      <BooleanRow
        label={t('formativeIncludedInPeriodGrade')}
        description={t('formativeIncludedInPeriodGradeDesc')}
        value={settings.formativeIncludedInPeriodGrade}
        onChange={(v) => onChange({ formativeIncludedInPeriodGrade: v })}
      />
      <SelectRow
        label={t('gpaPrecision')}
        description={t('gpaPrecisionDesc')}
        value={String(settings.gpaPrecision)}
        options={[
          { value: '1', label: t('gpaPrecision1') },
          { value: '2', label: t('gpaPrecision2') },
        ]}
        onChange={(v) => onChange({ gpaPrecision: Number(v) as 1 | 2 })}
      />
      <TextRow
        label={t('gpaScaleLabel')}
        description={t('gpaScaleLabelDesc')}
        value={settings.gpaScaleLabel}
        onChange={(v) => onChange({ gpaScaleLabel: v })}
        placeholder={t('gpa')}
      />

      <SubSectionCard title={t('atRiskDetection')} description={t('atRiskDetectionDesc')}>
        <BooleanRow
          label={t('atRiskDetectionEnabled')}
          value={settings.atRiskDetectionEnabled}
          onChange={(v) => onChange({ atRiskDetectionEnabled: v })}
        />
        {settings.atRiskDetectionEnabled && (
          <>
            <SelectRow
              label={t('atRiskDetectionFrequency')}
              value={settings.atRiskDetectionFrequency}
              options={[
                { value: 'daily', label: t('frequencyDaily') },
                { value: 'weekly', label: t('frequencyWeekly') },
              ]}
              onChange={(v) =>
                onChange({ atRiskDetectionFrequency: v as 'daily' | 'weekly' })
              }
            />
            <NumberRow
              label={t('gradingConsistencyThreshold')}
              description={t('gradingConsistencyThresholdDesc')}
              value={settings.gradingConsistencyThreshold}
              onChange={(v) => onChange({ gradingConsistencyThreshold: v ?? 15 })}
              min={1}
              max={100}
            />
            <BooleanRow
              label={t('requireApprovalForMarkingSchemes')}
              description={t('requireApprovalForMarkingSchemesDesc')}
              value={settings.requireApprovalForMarkingSchemes}
              onChange={(v) => onChange({ requireApprovalForMarkingSchemes: v })}
            />
          </>
        )}
      </SubSectionCard>
    </SectionCard>
  );
}
