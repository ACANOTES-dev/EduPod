'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

const ELIGIBLE_SANCTION_TYPES = new Set([
  'expulsion',
  'suspension_internal',
  'suspension_external',
]);

interface SanctionOption {
  id: string;
  sanction_number: string;
  type: string;
  status: string;
  scheduled_date: string;
  student: { id: string; first_name: string; last_name: string } | null;
}

interface SanctionsListResponse {
  data: SanctionOption[];
  meta: { page: number; pageSize: number; total: number };
}

interface CreateCaseResponse {
  id: string;
}

interface OpenCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (caseId: string) => void;
}

export function OpenCaseDialog({ open, onOpenChange, onCreated }: OpenCaseDialogProps) {
  const t = useTranslations('behaviour.exclusions.openCase');
  const tCommon = useTranslations('common');

  const [query, setQuery] = React.useState('');
  const [sanctions, setSanctions] = React.useState<SanctionOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiClient<SanctionsListResponse>('/api/v1/behaviour/sanctions?pageSize=100&status=scheduled', {
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data ?? []).filter((r) => ELIGIBLE_SANCTION_TYPES.has(r.type));
        setSanctions(rows);
      })
      .catch((err) => {
        console.error('[OpenCaseDialog] sanctions fetch failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, t]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedId(null);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return sanctions;
    const needle = query.trim().toLowerCase();
    return sanctions.filter((s) => {
      const studentName = s.student
        ? `${s.student.first_name} ${s.student.last_name}`.toLowerCase()
        : '';
      return (
        s.sanction_number.toLowerCase().includes(needle) ||
        s.type.toLowerCase().includes(needle) ||
        studentName.includes(needle)
      );
    });
  }, [query, sanctions]);

  async function handleSubmit() {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient<{ data: CreateCaseResponse } | CreateCaseResponse>(
        '/api/v1/behaviour/exclusion-cases',
        {
          method: 'POST',
          body: JSON.stringify({ sanction_id: selectedId }),
        },
      );
      const created = 'data' in res && res.data ? res.data : (res as CreateCaseResponse);
      onCreated(created.id);
    } catch (err) {
      console.error('[OpenCaseDialog] create failed', err);
      const apiErr = err as { error?: { message?: string } } | undefined;
      setError(apiErr?.error?.message ?? t('submitError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="ps-9"
            />
          </div>

          {isLoading && (
            <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
              {t('loading')}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
              {sanctions.length === 0 ? t('emptyAll') : t('emptyFiltered')}
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <ul className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface">
              {filtered.map((s) => {
                const active = selectedId === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-4 py-2.5 text-start transition-colors last:border-b-0 ${
                        active ? 'bg-primary-50 text-primary-900' : 'hover:bg-surface-secondary'
                      }`}
                    >
                      <span className="font-mono text-xs font-medium text-text-primary">
                        {s.sanction_number}
                      </span>
                      <span className="text-sm text-text-primary">
                        {s.student
                          ? `${s.student.first_name} ${s.student.last_name}`
                          : t('noStudent')}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {t(`sanctionType.${s.type}` as 'sanctionType.expulsion')}
                        {' · '}
                        {t('scheduledOn', { date: formatDate(s.scheduled_date) })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!selectedId || submitting}
          >
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
