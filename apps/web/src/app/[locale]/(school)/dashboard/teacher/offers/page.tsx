'use client';

import { Check, Clock, Loader2, Star, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface Offer {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
  absence_date: string;
  expires_at: string;
  is_nomination: boolean;
  absent_teacher_name: string | null;
  class_name: string | null;
  subject_name: string | null;
  room_name: string | null;
  start_time: string;
  end_time: string;
}

function minutesUntil(isoString: string): number {
  return Math.max(0, Math.floor((new Date(isoString).getTime() - Date.now()) / 60_000));
}

export default function TeacherOffersPage() {
  const t = useTranslations('leave.offers');

  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actingId, setActingId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: Offer[] }>('/api/v1/scheduling/offers/my');
      setOffers(res.data ?? []);
    } catch (err) {
      console.error('[TeacherOffersPage.refresh]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = async (id: string, verb: 'accept' | 'decline') => {
    setActingId(id);
    try {
      await apiClient(`/api/v1/scheduling/offers/${id}/${verb}`, {
        method: 'POST',
        body: verb === 'decline' ? JSON.stringify({ reason: null }) : undefined,
      });
      toast.success(t(verb === 'accept' ? 'acceptedToast' : 'declinedToast'));
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('actionError');
      toast.error(msg);
    } finally {
      setActingId(null);
    }
  };

  const pending = offers.filter((o) => o.status === 'pending');
  const confirmed = offers.filter((o) => o.status === 'accepted');

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('description')}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t('pending')}</h2>
            {pending.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-text-secondary">
                {t('noPending')}
              </div>
            ) : (
              pending.map((o) => {
                const mins = minutesUntil(o.expires_at);
                return (
                  <div key={o.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {o.is_nomination && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              <Star className="h-3 w-3" />
                              {t('nominated')}
                            </span>
                          )}
                          <span className="font-semibold text-text-primary">
                            {o.subject_name ?? o.class_name}
                          </span>
                          {o.subject_name && o.class_name && (
                            <span className="text-sm text-text-secondary">· {o.class_name}</span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-text-secondary">
                          {o.absence_date} · {o.start_time}–{o.end_time}
                          {o.room_name && ` · ${o.room_name}`}
                        </div>
                        <div className="mt-1 text-sm text-text-secondary">
                          {t('coveringFor', { name: o.absent_teacher_name ?? '' })}
                        </div>
                        <div className="mt-2 inline-flex items-center gap-1 text-xs text-amber-700">
                          <Clock className="h-3 w-3" />
                          {mins === 0 ? t('expiringSoon') : t('minsRemaining', { minutes: mins })}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => act(o.id, 'accept')}
                          disabled={actingId === o.id}
                          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                          {t('accept')}
                        </button>
                        <button
                          type="button"
                          onClick={() => act(o.id, 'decline')}
                          disabled={actingId === o.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          {t('decline')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {confirmed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">{t('confirmed')}</h2>
              {confirmed.map((o) => (
                <div key={o.id} className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-600" />
                    <span className="font-semibold text-text-primary">
                      {o.subject_name ?? o.class_name}
                    </span>
                    {o.class_name && o.subject_name && (
                      <span className="text-sm text-text-secondary">· {o.class_name}</span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    {o.absence_date} · {o.start_time}–{o.end_time}
                    {o.room_name && ` · ${o.room_name}`}
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    {t('coveringFor', { name: o.absent_teacher_name ?? '' })}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
