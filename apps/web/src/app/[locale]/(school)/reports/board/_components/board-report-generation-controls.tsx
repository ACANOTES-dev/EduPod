'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { BoardReportSectionKey } from '@school/shared/reports';
import { BOARD_REPORT_SECTION_KEYS } from '@school/shared/reports';
import {
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

interface BoardReportGenerationControlsProps {
  academicYears: Array<{ id: string; name: string }>;
  selectedYearId: string;
  onYearChange: (id: string) => void;
  selectedTerm: string;
  onTermChange: (term: string) => void;
  selectedSections: Set<BoardReportSectionKey>;
  onToggleSection: (section: BoardReportSectionKey) => void;
  onToggleAllSections: (checked: boolean) => void;
  anonymise: boolean;
  onAnonymiseChange: (value: boolean) => void;
  generating: boolean;
  onGenerate: () => void;
  loadingYears: boolean;
}

export function BoardReportGenerationControls({
  academicYears,
  selectedYearId,
  onYearChange,
  selectedTerm,
  onTermChange,
  selectedSections,
  onToggleSection,
  onToggleAllSections,
  anonymise,
  onAnonymiseChange,
  generating,
  onGenerate,
  loadingYears,
}: BoardReportGenerationControlsProps) {
  const t = useTranslations('reports');

  const allSelected = selectedSections.size === BOARD_REPORT_SECTION_KEYS.length;

  return (
    <div className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-base font-semibold text-text-primary">{t('board.generateTitle')}</h2>

      <div className="space-y-4">
        {/* Academic Year */}
        <div>
          <Label htmlFor="board-year">{t('board.academicYearLabel')}</Label>
          <Select
            value={selectedYearId}
            onValueChange={onYearChange}
            disabled={loadingYears || generating}
          >
            <SelectTrigger id="board-year" className="mt-2" data-testid="board-year-select">
              <SelectValue placeholder={t('board.academicYearPlaceholder')} />
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

        {/* Term */}
        <div>
          <Label htmlFor="board-term">{t('board.termLabel')}</Label>
          <Select value={selectedTerm} onValueChange={onTermChange} disabled={generating}>
            <SelectTrigger id="board-term" className="mt-2" data-testid="board-term-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((term) => (
                <SelectItem key={term} value={String(term)}>
                  {t(`board.term${term}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sections */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <Label>{t('board.sectionsLabel')}</Label>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => onToggleAllSections(!allSelected)}
              data-testid="board-toggle-all-sections"
            >
              {allSelected ? t('board.deselectAll') : t('board.selectAll')}
            </button>
          </div>
          <div className="space-y-2">
            {BOARD_REPORT_SECTION_KEYS.map((section) => (
              <label key={section} className="flex cursor-pointer items-center gap-3">
                <Checkbox
                  checked={selectedSections.has(section)}
                  onCheckedChange={() => onToggleSection(section)}
                  data-testid={`board-section-${section}`}
                />
                <span className="text-sm text-text-secondary">{t(`board.section.${section}`)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Anonymise Toggle */}
        <div className="space-y-2 rounded-lg border border-border bg-surface-secondary p-3">
          <label className="flex cursor-pointer items-center gap-3">
            <Checkbox
              checked={anonymise}
              onCheckedChange={(checked) => onAnonymiseChange(checked === true)}
              data-testid="board-anonymise-toggle"
            />
            <span className="text-sm font-medium text-text-primary">
              {t('board.anonymiseLabel')}
            </span>
          </label>
          <p className="ms-6 text-xs text-text-tertiary">{t('board.anonymiseHint')}</p>
        </div>

        {/* Generate Button */}
        <Button
          onClick={onGenerate}
          disabled={generating || selectedSections.size === 0 || !selectedYearId}
          className="w-full"
          data-testid="board-generate"
        >
          {generating ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('board.generating')}
            </>
          ) : (
            t('board.generateButton')
          )}
        </Button>
      </div>
    </div>
  );
}
