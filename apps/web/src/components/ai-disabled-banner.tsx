'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { useAuth } from '@/providers/auth-provider';

// Roles that are allowed to manage AI flags. Matches the backend permission
// `ai_flag.manage` which is attached only to school_owner / school_admin /
// platform_admin. Sourced from role_keys rather than a permission fetch so
// the banner renders synchronously with the rest of the page.
const AI_FLAG_MANAGE_ROLES = new Set(['school_owner', 'school_admin', 'platform_admin']);

function userCanManageAiFlags(user: ReturnType<typeof useAuth>['user']): boolean {
  if (!user?.memberships) return false;
  for (const m of user.memberships) {
    for (const r of m.roles ?? []) {
      if (AI_FLAG_MANAGE_ROLES.has(r.role_key)) return true;
    }
  }
  return false;
}

/**
 * Banner shown when an AI feature is disabled for the tenant.
 *
 * Admins get a direct link to `/settings/ai-flags` so they can enable it.
 * Non-admins would receive a 403 on that route, so instead they see a
 * "Contact your administrator" message with a mailto to the tenant owner
 * (the frontend doesn't know the owner's email, so the CTA is informational).
 */
export function AiDisabledBanner({ className }: { className?: string }) {
  const t = useTranslations('ai.disabled');
  const locale = useLocale();
  const { user } = useAuth();
  const canManage = userCanManageAiFlags(user);

  return (
    <div
      className={`rounded-2xl border border-dashed border-border bg-surface-secondary/50 p-10 text-center ${className ?? ''}`}
    >
      <Sparkles className="mx-auto h-8 w-8 text-text-tertiary" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold text-text-primary">{t('title')}</h2>
      <p className="mt-1 text-sm text-text-secondary">{t('body')}</p>
      {canManage ? (
        <Link
          href={`/${locale}/settings/ai-flags`}
          className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {t('manageLink')}
        </Link>
      ) : (
        <p className="mt-4 text-xs text-text-tertiary">{t('contactAdminHint')}</p>
      )}
    </div>
  );
}
