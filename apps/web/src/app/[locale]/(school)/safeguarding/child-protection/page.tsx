'use client';

import {
  AlertTriangle,
  ArrowRight,
  Download,
  EyeOff,
  FolderLock,
  KeySquare,
  Lock,
  RefreshCw,
  Search,
  UserSearch,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Input } from '@school/ui';

import { HubTile } from '@/components/hub-tile';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StudentResult {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface CpAccessCheck {
  data: { has_access: boolean };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ChildProtectionHubPage() {
  const t = useTranslations('childProtectionHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const canView = hasAnyRole(...ADMIN_ROLES);

  const [hasCpAccess, setHasCpAccess] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [searchTerm, setSearchTerm] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<StudentResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  // ── Probe CP access at page load ─────────────────────────────────────────
  React.useEffect(() => {
    if (!canView) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    setCheckError(null);

    // cp-access/check returns 200 with { has_access } even for non-DLPs.
    // The path requires a studentId param, but the endpoint only uses the
    // user context, so any valid UUID works as a probe; we use the
    // all-zeros UUID as a no-op placeholder.
    const PROBE_UUID = '00000000-0000-4000-8000-000000000000';
    apiClient<CpAccessCheck>(`/api/v1/child-protection/access/check/${PROBE_UUID}`)
      .then((res) => {
        if (!cancelled) setHasCpAccess(res.data.has_access);
      })
      .catch((err) => {
        console.error('[ChildProtectionHub] access check failed', err);
        if (!cancelled) {
          setHasCpAccess(false);
          setCheckError(t('loadError'));
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, reloadKey, t]);

  // ── Debounced student search ─────────────────────────────────────────────
  React.useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);

    const handle = setTimeout(() => {
      apiClient<{ data: StudentResult[] }>(
        `/api/v1/students?search=${encodeURIComponent(trimmed)}&pageSize=8&status=active`,
      )
        .then((res) => {
          if (!cancelled) setSearchResults(res.data ?? []);
        })
        .catch((err) => {
          console.error('[ChildProtectionHub] student search failed', err);
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchTerm]);

  // ── Permission denied (non-admin) ────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{ href: `/${locale}/safeguarding`, label: t('back') }}
        />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold text-text-primary">{t('denied.title')}</h2>
            <p className="text-sm text-text-secondary">{t('denied.body')}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/safeguarding`, label: t('back') }}
      />

      {/* ── Privacy banner ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2 rounded-2xl border border-zinc-300 bg-zinc-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-700">
            <EyeOff className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-zinc-800">{t('privacyBanner.title')}</p>
            <p className="text-xs text-zinc-600">{t('privacyBanner.body')}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-zinc-300 bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 sm:self-auto">
          <FolderLock className="h-3 w-3" />
          {t('privacyBanner.scopePill')}
        </span>
      </section>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {checkError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{checkError}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      )}

      {/* ── CP access state ─────────────────────────────────────────────── */}
      {!checking && hasCpAccess === false && (
        <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-amber-200/80 text-amber-700">
              <KeySquare className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-amber-900">{t('noAccess.title')}</p>
              <p className="text-xs text-amber-700">{t('noAccess.body')}</p>
            </div>
          </div>
          <Link
            href={`/${locale}/safeguarding/child-protection/access`}
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-amber-300 bg-surface px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 sm:self-auto"
          >
            {t('noAccess.manageCta')}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </Link>
        </section>
      )}

      {/* ── Student search ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-start gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 shadow-sm ring-1 ring-inset ring-black/5">
            <UserSearch className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary">{t('search.title')}</h2>
            <p className="mt-0.5 text-xs text-text-tertiary">{t('search.description')}</p>
          </div>
        </div>
        <div className="space-y-3 px-5 py-5 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('search.placeholder')}
              className="ps-10"
              autoComplete="off"
            />
          </div>
          {searchTerm.trim().length >= 2 && (
            <div className="rounded-xl border border-border bg-surface-secondary/40">
              {isSearching ? (
                <div className="flex items-center justify-center py-6 text-xs text-text-tertiary">
                  {t('search.loading')}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-xs text-text-tertiary">
                  {t('search.empty')}
                </div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {searchResults.map((student) => (
                    <li key={student.id}>
                      <Link
                        href={`/${locale}/safeguarding/child-protection/students/${student.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-text-secondary">
                          <Users className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {student.first_name} {student.last_name}
                          </p>
                          {student.student_number && (
                            <p dir="ltr" className="truncate font-mono text-xs text-text-tertiary">
                              {student.student_number}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Action tiles ─────────────────────────────────────────────────── */}
      <section
        aria-label={t('tiles.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        <HubTile
          icon={Download}
          title={t('tiles.export.title')}
          description={t('tiles.export.description')}
          href="/safeguarding/child-protection/export"
          accent="from-zinc-600 via-zinc-700 to-zinc-800"
          iconBg="bg-zinc-100 text-zinc-700"
          glow="from-zinc-50/80"
          tooltip={t('tiles.export.tooltip')}
          animationIndex={0}
        />
        <HubTile
          icon={KeySquare}
          title={t('tiles.access.title')}
          description={t('tiles.access.description')}
          href="/safeguarding/child-protection/access"
          accent="from-amber-500 via-amber-600 to-amber-700"
          iconBg="bg-amber-100 text-amber-700"
          glow="from-amber-50/80"
          tooltip={t('tiles.access.tooltip')}
          animationIndex={1}
        />
        <HubTile
          icon={FolderLock}
          title={t('tiles.sealed.title')}
          description={t('tiles.sealed.description')}
          href="/safeguarding/sealed"
          accent="from-slate-600 via-slate-700 to-slate-800"
          iconBg="bg-slate-100 text-slate-700"
          glow="from-slate-50/80"
          tooltip={t('tiles.sealed.tooltip')}
          animationIndex={2}
        />
      </section>

      {/* ── Audit footer ───────────────────────────────────────────────── */}
      <footer className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-border bg-surface-secondary/40 px-5 py-4 text-xs text-text-tertiary sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          <span>{t('footer.audit')}</span>
        </div>
        <div className="flex items-center gap-2">
          <FolderLock className="h-3.5 w-3.5" />
          <span>{t('footer.retention')}</span>
        </div>
      </footer>
    </div>
  );
}
