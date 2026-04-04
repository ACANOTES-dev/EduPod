'use client';

import { Loader2, MessageSquare, Plus, Send, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Textarea, toast } from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ParentNoteThread } from '../../_components/parent-note-thread';


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

interface NotesResponse {
  data: ParentNote[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentTeacherNotesPage() {
  const t = useTranslations('homework');
  const params = useParams<{ studentId: string }>();
  const studentId = params?.studentId ?? '';

  const [notes, setNotes] = React.useState<ParentNote[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  // Compose form state
  const [showCompose, setShowCompose] = React.useState(false);
  const [noteContent, setNoteContent] = React.useState('');
  const [sending, setSending] = React.useState(false);

  // Acknowledge state
  const [acknowledgingId, setAcknowledgingId] = React.useState<string | null>(null);

  // ─── Fetch notes ──────────────────────────────────────────────────────────

  const fetchNotes = React.useCallback(
    async (p: number) => {
      if (!studentId) return;
      setLoading(true);
      try {
        const res = await apiClient<NotesResponse>(
          `/api/v1/diary/${studentId}/parent-notes?page=${p}&pageSize=${pageSize}`,
        );
        setNotes(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch (err) {
        console.error('[ParentNotes] Failed to load notes', err);
      } finally {
        setLoading(false);
      }
    },
    [studentId],
  );

  React.useEffect(() => {
    void fetchNotes(page);
  }, [fetchNotes, page]);

  // ─── Send note ────────────────────────────────────────────────────────────

  const handleSendNote = React.useCallback(async () => {
    if (!noteContent.trim() || !studentId) return;
    setSending(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await apiClient(`/api/v1/diary/${studentId}/parent-notes`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          note_date: today,
          content: noteContent.trim(),
        }),
      });
      toast.success(t('parent.notes.noteSent'));
      setNoteContent('');
      setShowCompose(false);
      setPage(1);
      void fetchNotes(1);
    } catch (err) {
      console.error('[ParentNotesPage]', err);
      toast.error(t('common.errorGeneric'));
    } finally {
      setSending(false);
    }
  }, [noteContent, studentId, fetchNotes, t]);

  // ─── Acknowledge ──────────────────────────────────────────────────────────

  const handleAcknowledge = React.useCallback(
    async (noteId: string) => {
      setAcknowledgingId(noteId);
      try {
        await apiClient(`/api/v1/diary/parent-notes/${noteId}/acknowledge`, {
          method: 'PATCH',
        });
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, acknowledged: true, acknowledged_at: new Date().toISOString() }
              : n,
          ),
        );
        toast.success(t('parent.notes.acknowledgeSuccess'));
      } catch (err) {
        console.error('[ParentNotesPage]', err);
        toast.error(t('common.errorGeneric'));
      } finally {
        setAcknowledgingId(null);
      }
    },
    [t],
  );

  // ─── Pagination ───────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / pageSize);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('parent.notes.title')}
        description={t('parent.notes.description')}
        actions={
          <Button
            onClick={() => setShowCompose(!showCompose)}
            variant={showCompose ? 'ghost' : 'default'}
          >
            {showCompose ? (
              <>
                <X className="me-1.5 h-4 w-4" />
                {t('common.cancel')}
              </>
            ) : (
              <>
                <Plus className="me-1.5 h-4 w-4" />
                {t('parent.notes.newNote')}
              </>
            )}
          </Button>
        }
      />

      {/* Compose form */}
      {showCompose && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <Textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder={t('parent.notes.placeholder')}
            rows={4}
            maxLength={5000}
            className="w-full"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-tertiary">{noteContent.length}/5000</span>
            <Button onClick={() => void handleSendNote()} disabled={!noteContent.trim() || sending}>
              {sending ? (
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="me-1.5 h-4 w-4" />
              )}
              {t('parent.notes.send')}
            </Button>
          </div>
        </div>
      )}

      {/* Notes thread */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-primary">{t('parent.notes.noNotes')}</p>
        </div>
      ) : (
        <>
          <ParentNoteThread
            notes={notes}
            onAcknowledge={handleAcknowledge}
            acknowledgingId={acknowledgingId}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('common.previous')}
              </Button>
              <span className="text-sm text-text-secondary">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
