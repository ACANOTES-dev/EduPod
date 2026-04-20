'use client';

import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Calendar,
  Info,
  ListChecks,
  PlayCircle,
  Rocket,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface PolicyRule {
  id: string;
  name: string;
  stage: string;
  is_active: boolean;
}

interface ReplayResult {
  rule_name: string;
  stage: string;
  replay_period: { from: string; to: string };
  incidents_evaluated: number;
  incidents_matched: number;
  students_affected: number;
  affected_year_groups: string[];
  actions_that_would_fire: Record<string, number>;
  sample_matches: Array<{
    incident_number: string;
    occurred_at: string;
    student_label: string;
    year_group: string | null;
    category_name: string;
  }>;
}

const EXECUTE_PHRASE = 'replay-yes';

export default function PolicyReplayPage() {
  const t = useTranslations('behaviourPolicyReplay');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [rules, setRules] = React.useState<PolicyRule[]>([]);
  const [ruleId, setRuleId] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');

  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [preview, setPreview] = React.useState<ReplayResult | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const [executePhrase, setExecutePhrase] = React.useState('');
  const [executing, setExecuting] = React.useState(false);
  const [executeNote, setExecuteNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    void apiClient<{ data: PolicyRule[] }>('/api/v1/behaviour/policies?pageSize=100')
      .then((res) => setRules(res.data ?? []))
      .catch((err) => {
        console.error('[PolicyReplayPage:rules]', err);
      });
  }, []);

  const activeRules = rules.filter((r) => r.is_active);

  const canPreview = ruleId && fromDate && toDate;

  const handlePreview = async () => {
    if (!canPreview) return;
    setPreviewLoading(true);
    setPreview(null);
    setPreviewError(null);
    try {
      const res = await apiClient<ReplayResult>('/api/v1/behaviour/policies/replay/preview', {
        method: 'POST',
        body: JSON.stringify({
          rule_id: ruleId,
          replay_period: { from: fromDate, to: toDate },
          dry_run: true,
        }),
      });
      setPreview(res);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setPreviewError(ex?.error?.message ?? t('errors.previewFailed'));
      console.error('[PolicyReplayPage:preview]', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    if (executePhrase !== EXECUTE_PHRASE || !preview) return;
    setExecuting(true);
    setExecuteNote(null);
    try {
      // Backend follow-up: persisting replay mode is not yet wired
      // (see impl 09 completion record). We call the same endpoint with
      // dry_run=false — if the backend currently rejects this, we surface a
      // structured error and the user sees a honest note.
      await apiClient('/api/v1/behaviour/policies/replay', {
        method: 'POST',
        body: JSON.stringify({
          rule_id: ruleId,
          replay_period: { from: fromDate, to: toDate },
          dry_run: false,
        }),
      });
      setExecuteNote(t('execute.success'));
      setExecutePhrase('');
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setExecuteNote(ex?.error?.message ?? t('execute.notWired'));
      console.error('[PolicyReplayPage:execute]', err);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link
            href={`/${locale}/settings/behaviour-policies`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {t('back')}
          </Link>
        }
      />

      {/* Safety banner */}
      <section className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="text-xs text-amber-900">
          <p className="font-medium">{t('banner.title')}</p>
          <p className="mt-1">{t('banner.body')}</p>
        </div>
      </section>

      {/* Filter form */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">{t('filters.title')}</h2>
        <p className="mt-1 text-xs text-text-tertiary">{t('filters.hint')}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <Label className="text-xs font-medium">{t('filters.rule')}</Label>
            <Select value={ruleId} onValueChange={setRuleId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t('filters.selectRule')} />
              </SelectTrigger>
              <SelectContent>
                {activeRules.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    {t('filters.noRules')}
                  </SelectItem>
                ) : (
                  activeRules.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium">{t('filters.from')}</Label>
            <Input
              type="date"
              className="mt-1"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs font-medium">{t('filters.to')}</Label>
            <Input
              type="date"
              className="mt-1"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={() => void handlePreview()} disabled={!canPreview || previewLoading}>
            <BarChart3 className="me-1.5 h-4 w-4" />
            {previewLoading ? t('filters.previewing') : t('filters.preview')}
          </Button>
        </div>
        {previewError && (
          <p className="mt-3 rounded-lg border border-danger-300 bg-danger-50 p-2 text-xs text-danger-800">
            {previewError}
          </p>
        )}
      </section>

      {/* Preview result */}
      {preview && (
        <section className="rounded-2xl border border-border bg-surface">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text-primary">{t('preview.title')}</h2>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {t('preview.subtitle', {
                rule: preview.rule_name,
                from: preview.replay_period.from,
                to: preview.replay_period.to,
              })}
            </p>
          </header>
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={Calendar}
              label={t('preview.evaluated')}
              value={preview.incidents_evaluated.toLocaleString()}
            />
            <Stat
              icon={ListChecks}
              label={t('preview.matched')}
              value={preview.incidents_matched.toLocaleString()}
              emphasis
            />
            <Stat
              icon={Users}
              label={t('preview.students')}
              value={preview.students_affected.toLocaleString()}
            />
            <Stat
              icon={Rocket}
              label={t('preview.actionsTotal')}
              value={Object.values(preview.actions_that_would_fire)
                .reduce((a, b) => a + b, 0)
                .toLocaleString()}
            />
          </div>

          {Object.keys(preview.actions_that_would_fire).length > 0 && (
            <div className="border-t border-border p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('preview.actionsBreakdown')}
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {Object.entries(preview.actions_that_would_fire).map(([action, count]) => (
                  <li key={action} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium text-text-primary">{action}</span>
                    <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs font-semibold">
                      {count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.sample_matches.length > 0 && (
            <div className="border-t border-border p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('preview.sampleMatches', { count: preview.sample_matches.length })}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-start text-xs font-medium text-text-tertiary">
                        {t('preview.columns.incident')}
                      </th>
                      <th className="pb-2 text-start text-xs font-medium text-text-tertiary">
                        {t('preview.columns.occurredAt')}
                      </th>
                      <th className="pb-2 text-start text-xs font-medium text-text-tertiary">
                        {t('preview.columns.student')}
                      </th>
                      <th className="pb-2 text-start text-xs font-medium text-text-tertiary">
                        {t('preview.columns.category')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample_matches.map((m) => (
                      <tr
                        key={m.incident_number}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="py-2 font-mono text-xs">{m.incident_number}</td>
                        <td className="py-2 text-xs text-text-secondary">
                          {new Date(m.occurred_at).toLocaleDateString()}
                        </td>
                        <td className="py-2">{m.student_label}</td>
                        <td className="py-2 text-text-secondary">{m.category_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Execute (typed confirmation) */}
      {preview && (
        <section className="rounded-2xl border border-rose-300 bg-rose-50 p-5">
          <header className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-700" />
            <h2 className="text-sm font-semibold text-rose-900">{t('execute.title')}</h2>
          </header>
          <p className="mt-2 text-xs text-rose-800">
            {t('execute.warning', {
              matched: preview.incidents_matched,
              students: preview.students_affected,
            })}
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>{t('execute.followUpNote')}</p>
          </div>
          <div className="mt-4">
            <Label className="text-xs font-medium text-rose-900">
              {t('execute.confirmLabel', { phrase: EXECUTE_PHRASE })}
            </Label>
            <Input
              className="mt-1"
              value={executePhrase}
              onChange={(e) => setExecutePhrase(e.target.value)}
              placeholder={EXECUTE_PHRASE}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button
            variant="destructive"
            className="mt-3"
            onClick={() => void handleExecute()}
            disabled={executePhrase !== EXECUTE_PHRASE || executing}
          >
            <PlayCircle className="me-1.5 h-4 w-4" />
            {executing ? t('execute.running') : t('execute.cta')}
          </Button>
          {executeNote && (
            <p className="mt-3 rounded-lg border border-border bg-surface p-2 text-xs text-text-primary">
              {executeNote}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  emphasis,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        emphasis ? 'border-primary-300 bg-primary-50' : 'border-border bg-surface-secondary'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p
        className={`mt-2 text-2xl font-bold ${emphasis ? 'text-primary-700' : 'text-text-primary'}`}
      >
        {value}
      </p>
    </div>
  );
}
