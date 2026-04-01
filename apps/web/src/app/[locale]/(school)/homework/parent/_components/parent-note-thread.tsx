'use client';

import { CheckCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParentNote {
  id: string;
  note_date: string;
  content: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
  author: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface ParentNoteThreadProps {
  notes: ParentNote[];
  onAcknowledge: (noteId: string) => void;
  acknowledgingId: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ParentNoteThread({ notes, onAcknowledge, acknowledgingId }: ParentNoteThreadProps) {
  const t = useTranslations('homework');

  // Group notes by note_date
  const grouped = React.useMemo(() => {
    const map = new Map<string, ParentNote[]>();
    for (const note of notes) {
      const dateKey = note.note_date.slice(0, 10);
      const list = map.get(dateKey) ?? [];
      list.push(note);
      map.set(dateKey, list);
    }
    // Sort dates descending
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [notes]);

  if (notes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {grouped.map(([dateKey, dateNotes]) => (
        <div key={dateKey}>
          {/* Date divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="shrink-0 text-xs font-medium text-text-tertiary">
              {formatDate(dateKey)}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Notes for this date */}
          <div className="space-y-3">
            {dateNotes.map((note) => (
              <div
                key={note.id}
                className={`rounded-xl border p-4 ${
                  !note.acknowledged
                    ? 'border-s-4 border-amber-300 border-e border-t border-b border-e-border border-t-border border-b-border bg-amber-50/50 dark:bg-amber-900/10'
                    : 'border-border bg-surface'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-semibold">
                      {note.author.first_name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {t('parent.notes.from')} {note.author.first_name} {note.author.last_name}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {formatDate(note.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary whitespace-pre-wrap">
                        {note.content}
                      </p>

                      {/* Acknowledged indicator */}
                      {note.acknowledged && note.acknowledged_at && (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          {t('parent.notes.acknowledged')} · {formatDate(note.acknowledged_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acknowledge button */}
                  {!note.acknowledged && (
                    <div className="shrink-0">
                      <Button
                        size="sm"
                        disabled={acknowledgingId === note.id}
                        onClick={() => onAcknowledge(note.id)}
                        className="w-full sm:w-auto"
                      >
                        {acknowledgingId === note.id ? (
                          <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="me-1.5 h-3.5 w-3.5" />
                        )}
                        {acknowledgingId === note.id
                          ? t('parent.notes.acknowledging')
                          : t('parent.notes.acknowledge')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
