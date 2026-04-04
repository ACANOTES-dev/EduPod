'use client';

import { Bot, HeartPulse, Info, MessageSquare, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

type ConsentStatus = 'granted' | 'withdrawn' | 'expired';
type ConsentCategory =
  | 'health'
  | 'ai_features'
  | 'communications'
  | 'cross_school'
  | 'student_experience';

interface ParentConsentItem {
  consent_id: string | null;
  subject_type: 'student' | 'parent' | 'staff' | 'applicant';
  subject_id: string;
  subject_name: string;
  consent_type: string;
  status: ConsentStatus;
  granted_at: string | null;
  withdrawn_at: string | null;
  evidence_type: string | null;
  notes: string | null;
}

const CATEGORY_ORDER: ConsentCategory[] = [
  'health',
  'ai_features',
  'communications',
  'cross_school',
  'student_experience',
];

const CATEGORY_ICONS = {
  health: HeartPulse,
  ai_features: Bot,
  communications: MessageSquare,
  cross_school: ShieldCheck,
  student_experience: ShieldCheck,
} as const;

const CONSENT_TYPE_CATEGORY_MAP: Record<string, ConsentCategory> = {
  health_data: 'health',
  allergy_data: 'health',
  medical_notes: 'health',
  photo_use: 'communications',
  whatsapp_channel: 'communications',
  email_marketing: 'communications',
  ai_grading: 'ai_features',
  ai_comments: 'ai_features',
  ai_risk_detection: 'ai_features',
  ai_progress_summary: 'ai_features',
  cross_school_benchmarking: 'cross_school',
  homework_diary: 'student_experience',
};

function formatDateLocale(value: string | null, locale: string): string {
  if (!value) return '-';

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

// ─── Age-gate banner ────────────────────────────────────────────────────────

interface AgeGatedStudent {
  student_id: string;
  first_name: string;
}

interface AgeGateStatusResponse {
  data: {
    age_gated_students: AgeGatedStudent[];
  };
}

function AgeGateBanner() {
  const [students, setStudents] = React.useState<AgeGatedStudent[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient<AgeGateStatusResponse>(
          '/api/v1/parent-portal/age-gate-status',
          { silent: true },
        );
        if (!cancelled && res.data.age_gated_students.length > 0) {
          setStudents(res.data.age_gated_students);
        }
      } catch (err) {
        console.warn('[privacyConsent] Failed to load consent status', err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (students.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/10">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
      <div>
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{t('dataProtectionRights')}</p>
        <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
          {students.length === 1 && students[0]
            ? `Your child ${students[0].first_name} is 17 or older.`
            : `${students.length} of your children are 17 or older.`}{' '}{t('underDpcGuidanceStudentsAged')}</p>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function PrivacyConsentPage() {
  const t = useTranslations('privacyConsent');
  const locale = useLocale();
  const [items, setItems] = React.useState<ParentConsentItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [withdrawingId, setWithdrawingId] = React.useState<string | null>(null);
  const [selectedConsent, setSelectedConsent] = React.useState<ParentConsentItem | null>(null);

  const loadConsents = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient<{ data: ParentConsentItem[] }>(
        '/api/v1/parent-portal/consent',
        {
          silent: true,
        },
      );
      setItems(response.data);
    } catch (err) {
      console.error('[PrivacyConsentPage.loadConsents]', err);
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadConsents();
  }, [loadConsents]);

  const groupedItems = CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter(
      (item) => (CONSENT_TYPE_CATEGORY_MAP[item.consent_type] ?? 'health') === category,
    ),
  })).filter((group) => group.items.length > 0);

  const handleWithdraw = React.useCallback(async () => {
    if (!selectedConsent?.consent_id) {
      return;
    }

    setWithdrawingId(selectedConsent.consent_id);
    try {
      await apiClient(`/api/v1/parent-portal/consent/${selectedConsent.consent_id}/withdraw`, {
        method: 'PATCH',
        silent: true,
      });
      toast.success(t('withdrawSuccess'));
      setSelectedConsent(null);
      await loadConsents();
    } catch (err) {
      console.error('[PrivacyConsentPage.handleWithdraw]', err);
      toast.error(t('withdrawError'));
    } finally {
      setWithdrawingId(null);
    }
  }, [loadConsents, selectedConsent, t]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-[28px] border border-border bg-gradient-to-br from-surface via-surface to-surface-secondary p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">
          {t('eyebrow')}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">
          {t('title')}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">{t('description')}</p>
      </div>

      <AgeGateBanner />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-2xl border border-border bg-surface-secondary"
            />
          ))}
        </div>
      ) : groupedItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-base font-medium text-text-primary">{t('emptyTitle')}</p>
          <p className="mt-2 text-sm text-text-secondary">{t('emptyDescription')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedItems.map((group) => {
            const Icon = CATEGORY_ICONS[group.category];

            return (
              <section
                key={group.category}
                className="space-y-4 rounded-2xl border border-border bg-surface p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-secondary text-text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      {t(`categories.${group.category}.title`)}
                    </h2>
                    <p className="text-sm text-text-secondary">
                      {t(`categories.${group.category}.description`)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {group.items.map((item) => (
                    <article
                      key={`${item.subject_id}-${item.consent_type}`}
                      className="rounded-2xl border border-border-secondary bg-surface-secondary p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {t(`types.${item.consent_type}.label`)}
                          </p>
                          <p className="mt-1 text-xs text-text-secondary">{item.subject_name}</p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.status === 'granted'
                              ? 'bg-success-fill text-success-text'
                              : 'bg-surface text-text-secondary'
                          }`}
                        >
                          {t(`status.${item.status}`)}
                        </span>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-text-secondary">
                        {t(`types.${item.consent_type}.description`)}
                      </p>

                      <dl className="mt-4 grid gap-3 text-xs text-text-secondary sm:grid-cols-2">
                        <div>
                          <dt className="font-medium text-text-tertiary">{t('grantedAt')}</dt>
                          <dd className="mt-1 text-sm text-text-primary">
                            {formatDateLocale(item.granted_at, locale)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-text-tertiary">{t('evidenceType')}</dt>
                          <dd className="mt-1 text-sm text-text-primary">
                            {item.evidence_type ? t(`evidence.${item.evidence_type}`) : '-'}
                          </dd>
                        </div>
                      </dl>

                      {item.status === 'granted' && item.consent_id ? (
                        <div className="mt-5">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSelectedConsent(item)}
                            disabled={withdrawingId === item.consent_id}
                          >
                            {t('withdraw')}
                          </Button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog
        open={selectedConsent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedConsent(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>
              {selectedConsent
                ? t('confirmDescription', {
                    type: t(`types.${selectedConsent.consent_type}.label`),
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedConsent(null)}
              disabled={withdrawingId !== null}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleWithdraw()}
              disabled={withdrawingId !== null}
            >
              {withdrawingId ? t('withdrawing') : t('confirmWithdraw')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
