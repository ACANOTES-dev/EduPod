'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export type CohortGroupBy = 'year_group' | 'class' | 'subject';

interface CohortFiltersProps {
  groupBy: CohortGroupBy;
  onGroupByChange: (value: CohortGroupBy) => void;
}

export function CohortFilters({ groupBy, onGroupByChange }: CohortFiltersProps) {
  const t = useTranslations('early_warning.cohort');

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-text-secondary">
        {t('group_by')}
      </span>
      <Select
        value={groupBy}
        onValueChange={(v) => onGroupByChange(v as CohortGroupBy)}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="year_group">{t('year_group')}</SelectItem>
          <SelectItem value="class">{t('class')}</SelectItem>
          <SelectItem value="subject">{t('subject')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
