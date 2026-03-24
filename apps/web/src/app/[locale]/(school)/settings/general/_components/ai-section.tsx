'use client';

import { useTranslations } from 'next-intl';

import { AiSettings } from './settings-types';
import { BooleanRow, NumberRow, SectionCard, SelectRow, TextareaRow } from './settings-ui';

interface AiSectionProps {
  settings: AiSettings;
  onChange: (updates: Partial<AiSettings>) => void;
}

export function AiSection({ settings, onChange }: AiSectionProps) {
  const t = useTranslations('settings');

  return (
    <SectionCard title={t('aiTitle')} description={t('aiDescription')}>
      <BooleanRow
        label={t('aiEnabled')}
        description={t('aiEnabledDescription')}
        value={settings.enabled}
        onChange={(v) => onChange({ enabled: v })}
      />
      {settings.enabled && (
        <>
          <SelectRow
            label={t('aiCommentStyle')}
            description={t('aiCommentStyleDesc')}
            value={settings.commentStyle}
            options={[
              { value: 'formal', label: t('aiCommentStyleFormal') },
              { value: 'warm', label: t('aiCommentStyleWarm') },
              { value: 'balanced', label: t('aiCommentStyleBalanced') },
            ]}
            onChange={(v) =>
              onChange({ commentStyle: v as 'formal' | 'warm' | 'balanced' })
            }
          />
          <TextareaRow
            label={t('aiCommentSampleReference')}
            description={t('aiCommentSampleReferenceDesc')}
            value={settings.commentSampleReference ?? ''}
            onChange={(v) => onChange({ commentSampleReference: v || null })}
            placeholder={t('aiCommentSampleReferencePlaceholder')}
          />
          <NumberRow
            label={t('aiCommentTargetWordCount')}
            description={t('aiCommentTargetWordCountDesc')}
            value={settings.commentTargetWordCount}
            onChange={(v) => onChange({ commentTargetWordCount: v ?? 100 })}
            min={20}
            max={500}
          />
          <BooleanRow
            label={t('aiProgressSummariesEnabled')}
            description={t('aiProgressSummariesEnabledDesc')}
            value={settings.aiProgressSummariesEnabled}
            onChange={(v) => onChange({ aiProgressSummariesEnabled: v })}
          />
          <NumberRow
            label={t('aiGradingDailyLimit')}
            description={t('aiGradingDailyLimitDesc')}
            value={settings.aiGradingDailyLimit}
            onChange={(v) => onChange({ aiGradingDailyLimit: v ?? 200 })}
            min={1}
          />
        </>
      )}
    </SectionCard>
  );
}
