'use client';

import { Button, Skeleton } from '@school/ui';
import { AlertTriangle, CheckCircle2, Flag, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { ModerationItem } from './survey-types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ModerationTabProps {
  items: ModerationItem[];
  loading: boolean;
  moderatingId: string | null;
  onModerate: (responseId: string, status: 'approved' | 'flagged' | 'redacted') => void;
  formatDateOnly: (dateStr: string) => string;
}

// ─── Moderation Tab ──────────────────────────────────────────────────────────

export function ModerationTab({
  items,
  loading,
  moderatingId,
  onModerate,
  formatDateOnly,
}: ModerationTabProps) {
  const t = useTranslations('wellbeing.surveyDetail');

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <p className="text-sm text-text-secondary">{t('noModerationItems')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">{t('moderationCount', { count: items.length })}</p>

      {items.map((item) => (
        <ModerationItemCard
          key={item.id}
          item={item}
          isProcessing={moderatingId === item.id}
          onModerate={onModerate}
          formatDateOnly={formatDateOnly}
        />
      ))}
    </div>
  );
}

// ─── Moderation Item Card ────────────────────────────────────────────────────

interface ModerationItemCardProps {
  item: ModerationItem;
  isProcessing: boolean;
  onModerate: (responseId: string, status: 'approved' | 'flagged' | 'redacted') => void;
  formatDateOnly: (dateStr: string) => string;
}

function ModerationItemCard({
  item,
  isProcessing,
  onModerate,
  formatDateOnly,
}: ModerationItemCardProps) {
  const t = useTranslations('wellbeing.surveyDetail');

  // Highlight flagged matches in the answer text
  function renderHighlightedText(text: string, matches: string[] | null): React.ReactNode {
    if (!matches || matches.length === 0) {
      return text;
    }

    // Build a regex from all matches, escaping special characters
    const escapedMatches = matches.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedMatches.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, idx) => {
      const isMatch = matches.some((m) => m.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <mark key={idx} className="rounded-sm bg-yellow-200 px-0.5">
            {part}
          </mark>
        );
      }
      return part;
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      {/* Question context */}
      <p className="mb-2 text-xs font-medium text-text-tertiary">{item.question_text}</p>

      {/* Response text with highlighted matches */}
      <div className="mb-3 rounded-lg bg-surface-secondary p-3">
        <p className="text-sm leading-relaxed text-text-primary">
          {renderHighlightedText(item.answer_text, item.flagged_matches)}
        </p>
      </div>

      {/* Meta row */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
        {item.moderation_status === 'flagged' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            {t('flagged')}
          </span>
        )}
        {item.moderation_status === 'pending' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
            {t('pendingModeration')}
          </span>
        )}
        <span>
          {t('submittedDate')}: {formatDateOnly(item.submitted_at)}
        </span>
        {item.flagged_matches && item.flagged_matches.length > 0 && (
          <span>
            {t('flaggedMatches')}: {item.flagged_matches.join(', ')}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onModerate(item.id, 'approved')}
          disabled={isProcessing}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <CheckCircle2 className="me-2 h-4 w-4 text-green-600" />
          {t('approve')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onModerate(item.id, 'flagged')}
          disabled={isProcessing}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <Flag className="me-2 h-4 w-4 text-amber-600" />
          {t('flag')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onModerate(item.id, 'redacted')}
          disabled={isProcessing}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <XCircle className="me-2 h-4 w-4" />
          {t('redact')}
        </Button>
      </div>
    </div>
  );
}
