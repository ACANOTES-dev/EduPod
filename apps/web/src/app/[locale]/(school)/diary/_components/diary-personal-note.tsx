'use client';

import { Textarea } from '@school/ui';
import { Check, NotebookPen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiaryNote {
  id: string;
  note_date: string;
  content: string;
}

interface DiaryNotesResponse {
  data: DiaryNote[];
  meta: { page: number; pageSize: number; total: number };
}

interface DiaryPersonalNoteProps {
  studentId: string;
  date: string; // YYYY-MM-DD
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiaryPersonalNote({ studentId, date }: DiaryPersonalNoteProps) {
  const t = useTranslations('diary');

  const [content, setContent] = React.useState('');
  const [existingNoteDate, setExistingNoteDate] = React.useState<string | null>(null);
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [isLoading, setIsLoading] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Fetch existing note ────────────────────────────────────────────────────

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setSaveStatus('idle');
      try {
        const res = await apiClient<DiaryNotesResponse>(
          `/api/v1/diary/${studentId}?page=1&pageSize=100`,
        );
        if (cancelled) return;

        const match = res.data.find((n) => {
          const noteDate = n.note_date.slice(0, 10);
          return noteDate === date;
        });

        if (match) {
          setContent(match.content);
          setExistingNoteDate(date);
        } else {
          setContent('');
          setExistingNoteDate(null);
        }
      } catch (err) {
        console.error('[DiaryPersonalNote.load]', err);
        if (!cancelled) {
          setContent('');
          setExistingNoteDate(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [studentId, date]);

  // ─── Auto-save (2s debounce) ────────────────────────────────────────────────

  const save = React.useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setSaveStatus('saving');
      try {
        if (existingNoteDate) {
          await apiClient(`/api/v1/diary/${studentId}/${date}`, {
            method: 'PATCH',
            body: JSON.stringify({ content: text }),
          });
        } else {
          await apiClient(`/api/v1/diary/${studentId}`, {
            method: 'POST',
            body: JSON.stringify({ note_date: date, content: text }),
          });
          setExistingNoteDate(date);
        }
        setSaveStatus('saved');
      } catch (err) {
        console.error('[DiaryPersonalNote.save]', err);
        setSaveStatus('idle');
      }
    },
    [studentId, date, existingNoteDate],
  );

  function handleChange(value: string) {
    setContent(value);
    setSaveStatus('idle');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void save(value);
    }, 2000);
  }

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-card rounded-lg border p-4 md:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <NotebookPen className="h-4 w-4" />
          {t('personalNotes')}
        </h3>
        {saveStatus === 'saving' && (
          <span className="text-muted-foreground text-xs">{t('saving')}</span>
        )}
        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3 w-3" />
            {t('saved')}
          </span>
        )}
      </div>
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : (
          <Textarea
            className="min-h-[120px] resize-y text-base"
            placeholder={t('addNote')}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}
