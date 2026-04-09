'use client';

import { Check, RotateCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge, Button, Textarea } from '@school/ui';

import { Sparkline } from './sparkline';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubjectRowStatus = 'idle' | 'saving' | 'saved' | 'error' | 'drafting';

export interface SubjectRowState {
  student_id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  score: number | null;
  grade: string | null;
  weighted_average: number | null;
  comment_id: string | null;
  text: string;
  is_ai_draft: boolean;
  finalised_at: string | null;
  status: SubjectRowStatus;
}

interface SubjectCommentRowProps {
  row: SubjectRowState;
  rowBg: string;
  canEdit: boolean;
  onTextChange: (row: SubjectRowState, text: string) => void;
  onAiDraft: (row: SubjectRowState) => void;
  onFinalise: (row: SubjectRowState) => void;
  onUnfinalise: (row: SubjectRowState) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SubjectCommentRow({
  row,
  rowBg,
  canEdit,
  onTextChange,
  onAiDraft,
  onFinalise,
  onUnfinalise,
}: SubjectCommentRowProps) {
  const t = useTranslations('reportComments.editor');

  const sparkValues: number[] = [];
  if (row.score != null) sparkValues.push(row.score);
  if (row.weighted_average != null) sparkValues.push(row.weighted_average);

  return (
    <tr className={rowBg}>
      <td
        className="sticky start-0 z-10 bg-inherit px-3 py-3 align-top border-b border-border/60"
        style={{ width: 200, minWidth: 200 }}
      >
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">
            {row.first_name} {row.last_name}
          </span>
          {row.student_number && (
            <span className="text-xs text-text-tertiary tabular-nums" dir="ltr">
              #{row.student_number}
            </span>
          )}
        </div>
      </td>

      <td
        className="px-3 py-3 align-top border-b border-border/60"
        style={{ width: 160, minWidth: 160 }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded bg-surface-secondary px-2 py-1 text-xs font-bold text-text-primary tabular-nums"
              dir="ltr"
            >
              {row.score != null ? `${row.score.toFixed(1)}%` : (row.grade ?? t('noGrade'))}
            </span>
            {row.grade && row.score != null && (
              <span className="text-xs text-text-tertiary">{row.grade}</span>
            )}
          </div>
          <div className="text-primary-500/70">
            <Sparkline values={sparkValues} />
          </div>
        </div>
      </td>

      <td className="px-3 py-3 align-top border-b border-border/60">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {row.is_ai_draft && !row.finalised_at && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                <Sparkles className="me-1 h-3 w-3" aria-hidden="true" />
                {t('aiBadge')}
              </Badge>
            )}
            {row.finalised_at && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                <Check className="me-1 h-3 w-3" aria-hidden="true" />
                {t('finalised')}
              </Badge>
            )}
            {row.status === 'saving' && (
              <span className="text-xs text-text-tertiary">{t('saving')}</span>
            )}
            {row.status === 'saved' && (
              <span className="text-xs text-emerald-700">{t('saved')}</span>
            )}
            {row.status === 'error' && (
              <span className="text-xs text-red-600">{t('saveFailed')}</span>
            )}
            {row.status === 'drafting' && (
              <span className="text-xs text-purple-700">{t('aiDraftRowInFlight')}</span>
            )}
          </div>

          <Textarea
            value={row.text}
            onChange={(e) => onTextChange(row, e.target.value)}
            rows={3}
            readOnly={!canEdit || !!row.finalised_at}
            placeholder={t('placeholder')}
            className="w-full text-base"
            aria-label={t('commentCol')}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAiDraft(row)}
              disabled={!canEdit || row.status === 'drafting' || !!row.finalised_at}
              className="min-h-11"
            >
              <Sparkles className="me-1 h-4 w-4" aria-hidden="true" />
              {row.status === 'drafting' ? t('aiDraftRowInFlight') : t('aiDraftRow')}
            </Button>
            {row.finalised_at ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onUnfinalise(row)}
                disabled={!canEdit}
                className="min-h-11"
              >
                <RotateCw className="me-1 h-4 w-4" aria-hidden="true" />
                {t('unfinalise')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => onFinalise(row)}
                disabled={!canEdit || !row.comment_id || row.text.trim().length === 0}
                className="min-h-11"
              >
                <Check className="me-1 h-4 w-4" aria-hidden="true" />
                {t('finalise')}
              </Button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
