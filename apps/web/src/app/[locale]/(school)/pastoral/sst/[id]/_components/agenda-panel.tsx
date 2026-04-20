'use client';

import {
  AlertTriangle,
  Calendar,
  ClipboardCheck,
  FileText,
  Hand,
  Save,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Label, Textarea } from '@school/ui';

import { formatDate } from '@/lib/format-date';
import type { SstAgendaItem } from '@/lib/pastoral';

// ─── Source metadata ──────────────────────────────────────────────────────────

type SourceKey =
  | 'manual'
  | 'auto_new_concern'
  | 'auto_case_review'
  | 'auto_overdue_action'
  | 'auto_early_warning'
  | 'auto_neps'
  | 'auto_intervention_review'
  | 'other';

function sourceKey(source: string): SourceKey {
  switch (source) {
    case 'manual':
    case 'auto_new_concern':
    case 'auto_case_review':
    case 'auto_overdue_action':
    case 'auto_early_warning':
    case 'auto_neps':
    case 'auto_intervention_review':
      return source;
    default:
      return 'other';
  }
}

function sourceIcon(key: SourceKey) {
  switch (key) {
    case 'manual':
      return Hand;
    case 'auto_new_concern':
      return AlertTriangle;
    case 'auto_case_review':
      return ClipboardCheck;
    case 'auto_overdue_action':
      return Calendar;
    case 'auto_early_warning':
      return AlertTriangle;
    case 'auto_neps':
      return FileText;
    case 'auto_intervention_review':
      return ClipboardCheck;
    default:
      return Sparkles;
  }
}

function sourceTone(key: SourceKey): string {
  switch (key) {
    case 'manual':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'auto_new_concern':
    case 'auto_early_warning':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'auto_case_review':
    case 'auto_intervention_review':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'auto_overdue_action':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'auto_neps':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    default:
      return 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200';
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface StudentResolver {
  (studentId: string): { id: string; name: string } | null;
}

export interface AgendaPanelProps {
  items: SstAgendaItem[];
  agendaPrecomputedAt: string | null;
  resolveStudent: StudentResolver;
  busyAction: string | null;
  onSaveItem: (
    itemId: string,
    payload: { discussion_notes: string; decisions: string },
  ) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgendaPanel({
  items,
  agendaPrecomputedAt,
  resolveStudent,
  busyAction,
  onSaveItem,
  onDeleteItem,
}: AgendaPanelProps) {
  const t = useTranslations('pastoral.sstDetail');
  const tAgenda = useTranslations('responsePlans.agendaPanel');

  // Group: cross-cutting (no student_id) at top, then by student
  const { crossCutting, byStudent, studentOrder } = React.useMemo(() => {
    const cross: SstAgendaItem[] = [];
    const map = new Map<string, SstAgendaItem[]>();
    const order: string[] = [];

    const sorted = [...items].sort((a, b) => a.display_order - b.display_order);
    for (const item of sorted) {
      if (!item.student_id) {
        cross.push(item);
        continue;
      }
      if (!map.has(item.student_id)) {
        map.set(item.student_id, []);
        order.push(item.student_id);
      }
      map.get(item.student_id)!.push(item);
    }

    return { crossCutting: cross, byStudent: map, studentOrder: order };
  }, [items]);

  if (items.length === 0) {
    return (
      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('agendaTitle')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('agendaDescription')}</p>
          </div>
          {agendaPrecomputedAt ? (
            <span className="text-xs text-text-tertiary">
              {tAgenda('lastComputed', { date: formatDate(agendaPrecomputedAt) })}
            </span>
          ) : null}
        </div>
        <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
          {t('emptyAgenda')}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('agendaTitle')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('agendaDescription')}</p>
          </div>
          {agendaPrecomputedAt ? (
            <span className="text-xs text-text-tertiary">
              {tAgenda('lastComputed', { date: formatDate(agendaPrecomputedAt) })}
            </span>
          ) : null}
        </div>
      </div>

      {crossCutting.length > 0 ? (
        <section className="rounded-3xl border border-fuchsia-200 bg-fuchsia-50/40 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-fuchsia-900">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {tAgenda('crossCuttingTitle')}
          </div>
          <p className="mt-1 text-sm text-fuchsia-900/80">{tAgenda('crossCuttingDescription')}</p>
          <div className="mt-4 space-y-3">
            {crossCutting.map((item) => (
              <AgendaItemCard
                key={item.id}
                item={item}
                t={t}
                tAgenda={tAgenda}
                studentName={null}
                busyAction={busyAction}
                onSaveItem={onSaveItem}
                onDeleteItem={onDeleteItem}
              />
            ))}
          </div>
        </section>
      ) : null}

      {studentOrder.map((studentId) => {
        const studentItems = byStudent.get(studentId) ?? [];
        const resolved = resolveStudent(studentId);
        return (
          <section key={studentId} className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Users className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              {resolved?.name ?? tAgenda('studentFallback', { id: studentId.slice(0, 8) })}
              <span className="ms-2 text-xs text-text-tertiary">
                {tAgenda('itemCount', { count: studentItems.length })}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {studentItems.map((item) => (
                <AgendaItemCard
                  key={item.id}
                  item={item}
                  t={t}
                  tAgenda={tAgenda}
                  studentName={resolved?.name ?? null}
                  busyAction={busyAction}
                  onSaveItem={onSaveItem}
                  onDeleteItem={onDeleteItem}
                />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}

// ─── Inner card ───────────────────────────────────────────────────────────────

function AgendaItemCard({
  item,
  t,
  tAgenda,
  studentName,
  busyAction,
  onSaveItem,
  onDeleteItem,
}: {
  item: SstAgendaItem;
  t: (key: string) => string;
  tAgenda: (key: string, values?: Record<string, unknown>) => string;
  studentName: string | null;
  busyAction: string | null;
  onSaveItem: AgendaPanelProps['onSaveItem'];
  onDeleteItem: AgendaPanelProps['onDeleteItem'];
}) {
  const key = sourceKey(item.source);
  const Icon = sourceIcon(key);
  const tone = sourceTone(key);
  const [discussionNotes, setDiscussionNotes] = React.useState(item.discussion_notes ?? '');
  const [decisions, setDecisions] = React.useState(item.decisions ?? '');
  const [expanded, setExpanded] = React.useState(Boolean(item.discussion_notes || item.decisions));

  React.useEffect(() => {
    setDiscussionNotes(item.discussion_notes ?? '');
    setDecisions(item.decisions ?? '');
  }, [item.discussion_notes, item.decisions]);

  const busyKey = `agenda-${item.id}`;
  const deleteKey = `agenda-del-${item.id}`;

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {tAgenda(`source.${key}`)}
            </span>
            {key !== 'manual' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-50 px-2 py-0.5 text-xs font-medium text-fuchsia-700">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {tAgenda('aiBadge')}
              </span>
            ) : null}
            {studentName ? <span className="text-xs text-text-tertiary">{studentName}</span> : null}
          </div>
          <p className="mt-2 text-sm font-medium text-text-primary">{item.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {key === 'manual' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busyAction === deleteKey}
              onClick={() => void onDeleteItem(item.id)}
              aria-label={tAgenda('delete')}
            >
              <Trash2 className="h-4 w-4 text-rose-700" aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? tAgenda('collapse') : tAgenda('expand')}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-3">
          <div className="space-y-1">
            <Label>{t('discussionNotes')}</Label>
            <Textarea
              value={discussionNotes}
              onChange={(event) => setDiscussionNotes(event.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label>{t('decisions')}</Label>
            <Textarea
              value={decisions}
              onChange={(event) => setDecisions(event.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={busyAction === busyKey}
              onClick={() =>
                void onSaveItem(item.id, { discussion_notes: discussionNotes, decisions })
              }
            >
              <Save className="me-2 h-4 w-4" aria-hidden="true" />
              {t('saveAgendaItem')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
