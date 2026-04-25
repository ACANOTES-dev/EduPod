'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

interface ComplianceGenerationControlsProps {
  academicYears: Array<{ id: string; name: string }>;
  selectedYearId: string;
  onYearChange: (id: string) => void;
  generating: boolean;
  onGenerate: () => void;
  loadingYears: boolean;
  selectedFieldCount: number;
}

export function ComplianceGenerationControls({
  academicYears,
  selectedYearId,
  onYearChange,
  generating,
  onGenerate,
  loadingYears,
  selectedFieldCount,
}: ComplianceGenerationControlsProps) {
  const t = useTranslations('reports');

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6 print:hidden">
      <h2 className="text-base font-semibold text-text-primary">{t('compliance.generateTitle')}</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="compliance-year">{t('compliance.academicYearLabel')}</Label>
          <Select
            value={selectedYearId}
            onValueChange={onYearChange}
            disabled={loadingYears || generating}
          >
            <SelectTrigger id="compliance-year" className="mt-2">
              <SelectValue placeholder={t('compliance.academicYearPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={onGenerate}
          disabled={generating || !selectedYearId || selectedFieldCount === 0}
          className="md:min-w-44"
          data-testid="compliance-generate"
        >
          {generating ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('compliance.generating')}
            </>
          ) : (
            t('compliance.generateButton')
          )}
        </Button>
      </div>

      <p className="text-xs text-text-tertiary">
        {t('compliance.fieldsSelected', { count: selectedFieldCount })}
      </p>
    </section>
  );
}
