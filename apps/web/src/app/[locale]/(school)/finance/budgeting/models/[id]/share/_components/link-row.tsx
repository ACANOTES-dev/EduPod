'use client';

import { Copy, Lock, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge, Button, toast } from '@school/ui';

import { deriveLifecycle, type ShareableLinkRow } from './share-types';

interface Props {
  link: ShareableLinkRow;
  canRevoke: boolean;
  onRevokeClick: (linkId: string) => void;
}

function formatRelativeMs(
  ms: number,
  t: (key: string, params?: Record<string, number>) => string,
): string {
  const minutes = Math.round(ms / 60_000);
  const hours = Math.round(ms / 3_600_000);
  const days = Math.round(ms / 86_400_000);
  if (Math.abs(minutes) < 1) return t('justNow');
  if (Math.abs(minutes) < 60) return t('minutesAgo', { n: Math.abs(minutes) });
  if (Math.abs(hours) < 24) return t('hoursAgo', { n: Math.abs(hours) });
  return t('daysAgo', { n: Math.abs(days) });
}

function formatExpiry(
  iso: string,
  t: (key: string, params?: Record<string, number | string>) => string,
): string {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  const hours = Math.round(ms / 3_600_000);
  if (ms < 0) return t('expired');
  if (Math.abs(days) >= 1) return t('expiresInDays', { n: days });
  return t('expiresInHours', { n: Math.max(1, hours) });
}

export function LinkRow({ link, canRevoke, onRevokeClick }: Props) {
  const t = useTranslations('financeBudgetingShare.row');
  const tRel = useTranslations('financeBudgetingShare.relativeTime');
  const lifecycle = deriveLifecycle(link);
  const isActive = lifecycle === 'active';
  const tokenSuffix = link.token.slice(-8);

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link.full_url);
      toast.success(t('urlCopied'));
    } catch (err) {
      console.error('[LinkRow.copy]', err);
      toast.error(t('copyFailed'));
    }
  };

  const lastViewedLabel = link.last_viewed_at
    ? formatRelativeMs(Date.now() - new Date(link.last_viewed_at).getTime(), tRel)
    : t('neverViewed');

  return (
    <article
      role="article"
      aria-labelledby={`link-${link.id}-token`}
      className={`flex flex-col gap-3 rounded-2xl border p-4 ${
        isActive ? 'border-border bg-surface' : 'border-border/60 bg-muted/40 text-text-secondary'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          id={`link-${link.id}-token`}
          className="font-mono text-xs text-text-tertiary"
          dir="ltr"
        >
          …{tokenSuffix}
        </span>
        {lifecycle === 'expired' && <Badge variant="secondary">{t('badges.expired')}</Badge>}
        {lifecycle === 'revoked' && <Badge variant="danger">{t('badges.revoked')}</Badge>}
        {lifecycle === 'active' && (
          <span className="text-xs text-text-secondary">{formatExpiry(link.expires_at, t)}</span>
        )}
        {link.has_password && (
          <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {t('passwordProtected')}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 text-xs text-text-secondary">
        <span>
          {t('viewedNTimes', { n: link.view_count })} ·{' '}
          {t('lastViewed', { value: lastViewedLabel })}
        </span>
        <span>{t('scenarios', { list: link.scenarios_visible.join(', ') })}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCopy}
          disabled={!isActive}
          title={!isActive ? t('actionsDisabled') : undefined}
          aria-label={`${t('copyUrl')} …${tokenSuffix}`}
        >
          <Copy className="me-1 h-4 w-4" aria-hidden="true" />
          {t('copyUrl')}
        </Button>
        {canRevoke && lifecycle === 'active' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRevokeClick(link.id)}
            aria-label={`${t('revoke')} …${tokenSuffix}`}
          >
            <Trash2 className="me-1 h-4 w-4" aria-hidden="true" />
            {t('revoke')}
          </Button>
        )}
      </div>
    </article>
  );
}
