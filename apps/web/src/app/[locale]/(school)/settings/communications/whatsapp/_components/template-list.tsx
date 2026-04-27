'use client';

import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';

export interface TemplateRow {
  id: string;
  template_key: string;
  language_code: string;
  category: 'transactional' | 'marketing' | 'authentication' | 'utility';
  body: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'paused';
  twilio_template_sid: string | null;
  rejected_reason: string | null;
  approved_at: string | null;
  created_at: string;
}

const STATUS_TOKENS: Record<TemplateRow['status'], string> = {
  pending: 'bg-surface-secondary text-text-secondary',
  submitted: 'bg-info-100 text-info-700',
  approved: 'bg-success-100 text-success-700',
  rejected: 'bg-destructive/10 text-destructive',
  paused: 'bg-warning-100 text-warning-700',
};

export function TemplateList({ reloadKey, onChange }: { reloadKey: number; onChange: () => void }) {
  const t = useTranslations('settings.communications.whatsapp.templates');
  const [rows, setRows] = React.useState<TemplateRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const raw = await apiClient<{ data: TemplateRow[] } | TemplateRow[]>(
        '/api/v1/whatsapp-templates',
      );
      setRows(unwrap<TemplateRow[]>(raw));
    } catch (err) {
      console.error('[TemplateList.load]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function performAction(
    id: string,
    action: 'submit' | 'sync' | 'pause' | 'resume',
  ): Promise<void> {
    setBusyId(id);
    try {
      await apiClient(`/api/v1/whatsapp-templates/${id}/${action}`, { method: 'POST' });
      await load();
      onChange();
      toast.success(t(`actions.${action}.success`));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t(`actions.${action}.error`));
    } finally {
      setBusyId(null);
    }
  }

  async function performDelete(id: string, key: string) {
    if (!window.confirm(t('actions.delete.confirm', { key }))) return;
    setBusyId(id);
    try {
      await apiClient(`/api/v1/whatsapp-templates/${id}`, { method: 'DELETE' });
      await load();
      onChange();
      toast.success(t('actions.delete.success'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('actions.delete.error'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <header>
        <h2 className="text-base font-semibold text-text-primary">{t('title')}</h2>
        <p className="mt-0.5 text-sm text-text-secondary">{t('description')}</p>
      </header>

      <div className="mt-4 space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        )}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-text-tertiary">{t('empty')}</p>
        )}
        {!isLoading &&
          rows.map((row) => (
            <TemplateCard
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              busy={busyId === row.id}
              onToggle={() => setExpandedId((id) => (id === row.id ? null : row.id))}
              onAction={(a) => performAction(row.id, a)}
              onDelete={() => performDelete(row.id, row.template_key)}
            />
          ))}
      </div>
    </section>
  );
}

function TemplateCard({
  row,
  expanded,
  busy,
  onToggle,
  onAction,
  onDelete,
}: {
  row: TemplateRow;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onAction: (action: 'submit' | 'sync' | 'pause' | 'resume') => void;
  onDelete: () => void;
}) {
  const t = useTranslations('settings.communications.whatsapp.templates');
  const tCategories = useTranslations('settings.communications.whatsapp.templates.categories');
  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-text-primary" dir="ltr">
            {row.template_key}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('language')}: {row.language_code} · {t('category')}: {tCategories(row.category)}
          </p>
          {row.approved_at && (
            <p className="mt-0.5 text-xs text-text-tertiary">
              {t('approvedAt', { ts: new Date(row.approved_at).toLocaleDateString() })}
            </p>
          )}
          {row.status === 'rejected' && row.rejected_reason && (
            <p className="mt-1 text-xs text-destructive">
              {t('rejectedReason', { reason: row.rejected_reason })}
            </p>
          )}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_TOKENS[row.status]}`}>
          {t(`status.${row.status}`)}
        </span>
      </div>

      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        onClick={onToggle}
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? t('hideBody') : t('showBody')}
      </button>

      {expanded && (
        <pre className="mt-2 whitespace-pre-wrap rounded border border-border bg-surface p-3 font-mono text-xs">
          {row.body}
        </pre>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {row.status === 'pending' && (
          <Button type="button" size="sm" disabled={busy} onClick={() => onAction('submit')}>
            {t('actions.submit.button')}
          </Button>
        )}
        {row.status === 'submitted' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAction('sync')}
          >
            {t('actions.sync.button')}
          </Button>
        )}
        {row.status === 'approved' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAction('pause')}
          >
            {t('actions.pause.button')}
          </Button>
        )}
        {row.status === 'paused' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAction('resume')}
          >
            {t('actions.resume.button')}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onDelete}
          className="text-destructive hover:bg-destructive/10"
        >
          {t('actions.delete.button')}
        </Button>
      </div>
    </div>
  );
}
