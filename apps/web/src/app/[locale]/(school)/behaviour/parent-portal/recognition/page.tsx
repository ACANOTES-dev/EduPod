'use client';

import { Award, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecognitionItem {
  id: string;
  student: { first_name: string; last_name: string } | null;
  award: { name: string; icon: string | null; color: string | null } | null;
  category: { name: string; color: string | null } | null;
  points: number;
  message: string | null;
  published_at: string | null;
  created_at: string;
}

interface PendingPublication {
  id: string;
  student_id: string;
  student_name: string;
  publication_type: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentRecognitionWallPage() {
  const t = useTranslations('behaviour.parentRecognition');
  const tPending = useTranslations('parentRecognition');
  const [items, setItems] = React.useState<RecognitionItem[]>([]);
  const [pending, setPending] = React.useState<PendingPublication[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<PendingPublication | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, pendingRes] = await Promise.all([
        apiClient<{ data: RecognitionItem[] }>('/api/v1/parent/behaviour/recognition', {
          silent: true,
        }).catch(() => ({ data: [] as RecognitionItem[] })),
        apiClient<{ data: PendingPublication[] }>('/api/v1/parent/behaviour/recognition/pending', {
          silent: true,
        }).catch(() => ({ data: [] as PendingPublication[] })),
      ]);
      setItems(itemsRes.data ?? []);
      setPending(pendingRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleApprove = async (pub: PendingPublication) => {
    setBusyId(pub.id);
    try {
      await apiClient(`/api/v1/parent/behaviour/recognition/pending/${pub.id}/approve`, {
        method: 'PATCH',
      });
      setPending((prev) => prev.filter((p) => p.id !== pub.id));
      void loadAll();
    } catch (err) {
      console.error('[ParentRecognitionApprove]', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await apiClient(`/api/v1/parent/behaviour/recognition/pending/${rejectTarget.id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      setPending((prev) => prev.filter((p) => p.id !== rejectTarget.id));
      setRejectTarget(null);
      setRejectReason('');
      void loadAll();
    } catch (err) {
      console.error('[ParentRecognitionReject]', err);
    } finally {
      setBusyId(null);
    }
  };

  const getInitials = (student: RecognitionItem['student']) => {
    if (!student) return '?';
    return `${student.first_name.charAt(0)}${student.last_name.charAt(0)}`.toUpperCase();
  };

  const getDisplayName = (student: RecognitionItem['student']) => {
    if (!student) return 'Unknown';
    return `${student.first_name} ${student.last_name.charAt(0)}.`;
  };

  const getAccentColor = (item: RecognitionItem) =>
    item.award?.color ?? item.category?.color ?? '#6366F1';

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* WB-C-25 — Pending parent-consent banner */}
      {pending.length > 0 && (
        <section className="space-y-3 rounded-xl border border-primary-200 bg-primary-50 p-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {tPending('pendingBannerTitle')}
            </p>
            <p className="text-xs text-text-secondary">
              {tPending('pendingBannerBody', { count: pending.length })}
            </p>
          </div>
          <ul className="space-y-2">
            {pending.map((pub) => (
              <li
                key={pub.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {pub.student_name}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {pub.publication_type.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleApprove(pub)}
                    disabled={busyId === pub.id}
                  >
                    <Check className="me-1 h-4 w-4" aria-hidden="true" />
                    {tPending('approve')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectTarget(pub);
                      setRejectReason('');
                    }}
                    disabled={busyId === pub.id}
                  >
                    <X className="me-1 h-4 w-4" aria-hidden="true" />
                    {tPending('reject')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <Award className="mx-auto h-12 w-12 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-primary">{t('noAwards')}</p>
          <p className="mt-1 text-xs text-text-tertiary">{t('checkBack')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => {
            const accentColor = getAccentColor(item);
            const awardOrCategory = item.award?.name ?? item.category?.name ?? null;

            return (
              <div
                key={item.id}
                className="relative overflow-hidden rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
              >
                {/* Top accent bar */}
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: accentColor }}
                />

                <div className="mt-1 flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    {getInitials(item.student)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {getDisplayName(item.student)}
                    </p>

                    {awardOrCategory && (
                      <div className="mt-1 flex items-center gap-1">
                        {item.award?.icon ? (
                          <span className="text-base leading-none">{item.award.icon}</span>
                        ) : (
                          <Award className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} />
                        )}
                        <span className="text-xs font-medium" style={{ color: accentColor }}>
                          {awardOrCategory}
                        </span>
                      </div>
                    )}
                  </div>

                  {item.points > 0 && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      +{item.points}
                      {t('pts')}
                    </span>
                  )}
                </div>

                {item.message && (
                  <p className="mt-3 line-clamp-2 text-xs text-text-secondary">
                    &ldquo;{item.message}&rdquo;
                  </p>
                )}

                <p className="mt-2 text-[11px] text-text-tertiary">
                  {formatDate(item.published_at ?? item.created_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tPending('rejectReason')}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
            placeholder={tPending('rejectReasonPlaceholder')}
            className="min-h-[96px] text-base"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason('');
              }}
              disabled={busyId !== null}
            >
              {tPending('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={busyId !== null}>
              {tPending('submitReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
