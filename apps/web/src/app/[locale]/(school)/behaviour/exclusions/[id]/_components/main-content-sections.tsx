'use client';

import { Badge, Button, Input, Textarea } from '@school/ui';
import { CheckCircle2, FileText, Gavel, Plus, ShieldAlert, Trash2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';


import type {
  ExclusionDetail,
  HearingAttendee,
  HistoryEntry,
  TimelineStep,
} from './exclusion-types';
import { formatLabel } from './exclusion-types';

import { formatDate, formatDateTime } from '@/lib/format-date';

// ─── Timeline Dot ─────────────────────────────────────────────────────────────

function TimelineDot({ status }: { status: string }) {
  const base = 'h-3 w-3 rounded-full border-2';
  switch (status) {
    case 'complete':
      return <div className={`${base} border-green-500 bg-green-500`} />;
    case 'pending':
      return <div className={`${base} border-amber-500 bg-amber-500`} />;
    case 'overdue':
      return <div className={`${base} border-red-500 bg-red-500`} />;
    default:
      return (
        <div
          className={`${base} border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700`}
        />
      );
  }
}

// ─── Statutory Timeline ───────────────────────────────────────────────────────

interface StatutoryTimelineProps {
  timeline: TimelineStep[];
  markingComplete: string | null;
  onMarkComplete: (step: TimelineStep) => void;
}

export function StatutoryTimeline({
  timeline,
  markingComplete,
  onMarkComplete,
}: StatutoryTimelineProps) {
  const t = useTranslations('behaviour.exclusionDetail');

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">
          {t('sections.statutoryTimeline')}
        </h3>
      </div>
      {timeline.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('noTimeline')}</p>
      ) : (
        <div className="space-y-3">
          {timeline.map((step) => (
            <div
              key={step.step}
              className="flex items-start gap-3 rounded-lg bg-surface-secondary p-3"
            >
              <div className="mt-0.5">
                <TimelineDot status={step.status} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{step.step}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-tertiary">
                  {step.required_by && <span>Due: {formatDate(step.required_by)}</span>}
                  {step.completed_at && (
                    <span className="text-green-600 dark:text-green-400">
                      Completed: {formatDateTime(step.completed_at)}
                    </span>
                  )}
                </div>
              </div>
              {step.status !== 'complete' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={markingComplete === step.step}
                  onClick={() => onMarkComplete(step)}
                >
                  {markingComplete === step.step ? (
                    t('saving')
                  ) : (
                    <>
                      <CheckCircle2 className="me-1 h-3.5 w-3.5" />
                      Complete
                    </>
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Formal Notice ────────────────────────────────────────────────────────────

interface FormalNoticeProps {
  issuedAt: string | null;
  generating: string | null;
  onGenerate: () => void;
}

export function FormalNoticeSection({ issuedAt, generating, onGenerate }: FormalNoticeProps) {
  const t = useTranslations('behaviour.exclusionDetail');

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-5 w-5 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('sections.formalNotice')}</h3>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {issuedAt ? (
          <Badge
            variant="secondary"
            className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
          >
            Issued: {formatDateTime(issuedAt)}
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          >
            {t('notYetIssued')}
          </Badge>
        )}
        <Button variant="outline" size="sm" disabled={generating === 'notice'} onClick={onGenerate}>
          {generating === 'notice' ? t('generating') : t('generateNotice')}
        </Button>
      </div>
    </div>
  );
}

// ─── Hearing Section ──────────────────────────────────────────────────────────

interface HearingSectionProps {
  exclusion: ExclusionDetail;
  hearingDate: string;
  onHearingDateChange: (val: string) => void;
  attendees: HearingAttendee[];
  onAttendeesChange: (attendees: HearingAttendee[]) => void;
  representation: string;
  onRepresentationChange: (val: string) => void;
  hearingSubmitting: boolean;
  onSaveHearing: () => void;
  onMarkHearingHeld: () => void;
}

export function HearingSection({
  exclusion,
  hearingDate,
  onHearingDateChange,
  attendees,
  onAttendeesChange,
  representation,
  onRepresentationChange,
  hearingSubmitting,
  onSaveHearing,
  onMarkHearingHeld,
}: HearingSectionProps) {
  const t = useTranslations('behaviour.exclusionDetail');

  const addAttendee = () => {
    onAttendeesChange([...attendees, { name: '', role: '', relationship: '' }]);
  };

  const removeAttendee = (index: number) => {
    onAttendeesChange(attendees.filter((_, i) => i !== index));
  };

  const updateAttendee = (index: number, field: keyof HearingAttendee, value: string) => {
    const updated = [...attendees];
    const item = updated[index];
    if (item) {
      updated[index] = { ...item, [field]: value };
      onAttendeesChange(updated);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('sections.hearing')}</h3>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-primary">{t('hearingDate')}</label>
          <Input
            type="date"
            value={hearingDate}
            onChange={(e) => onHearingDateChange(e.target.value)}
            className="w-full sm:w-56"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text-primary">Attendees</label>
            <Button variant="ghost" size="sm" onClick={addAttendee}>
              <Plus className="me-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          {attendees.length === 0 ? (
            <p className="text-xs text-text-tertiary">{t('noAttendees')}</p>
          ) : (
            <div className="space-y-2">
              {attendees.map((att, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-secondary p-2"
                >
                  <Input
                    placeholder="Name"
                    value={att.name}
                    onChange={(e) => updateAttendee(idx, 'name', e.target.value)}
                    className="w-full text-sm sm:w-36"
                  />
                  <Input
                    placeholder="Role"
                    value={att.role}
                    onChange={(e) => updateAttendee(idx, 'role', e.target.value)}
                    className="w-full text-sm sm:w-36"
                  />
                  <Input
                    placeholder="Relationship"
                    value={att.relationship ?? ''}
                    onChange={(e) => updateAttendee(idx, 'relationship', e.target.value)}
                    className="w-full text-sm sm:w-36"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-red-500"
                    onClick={() => removeAttendee(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-primary">
            {t('studentRepresentation')}
          </label>
          <Textarea
            value={representation}
            onChange={(e) => onRepresentationChange(e.target.value)}
            placeholder="Notes on student's representation at the hearing..."
            rows={3}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={hearingSubmitting} onClick={onSaveHearing}>
            {hearingSubmitting ? t('saving') : t('saveHearingDetails')}
          </Button>
          {exclusion.status === 'hearing_scheduled' && (
            <Button disabled={hearingSubmitting} onClick={onMarkHearingHeld}>
              {hearingSubmitting ? t('updating') : t('markHearingHeld')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Board Pack Section ───────────────────────────────────────────────────────

interface BoardPackSectionProps {
  generatedAt: string | null;
  generating: string | null;
  onGenerate: () => void;
}

export function BoardPackSection({ generatedAt, generating, onGenerate }: BoardPackSectionProps) {
  const t = useTranslations('behaviour.exclusionDetail');

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-5 w-5 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('sections.boardPack')}</h3>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {generatedAt ? (
          <Badge
            variant="secondary"
            className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
          >
            Generated: {formatDateTime(generatedAt)}
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          >
            {t('notGenerated')}
          </Badge>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={generating === 'board-pack'}
          onClick={onGenerate}
        >
          {generating === 'board-pack' ? t('generating') : t('generateBoardPack')}
        </Button>
      </div>
    </div>
  );
}

// ─── Decision Section ─────────────────────────────────────────────────────────

interface DecisionSectionProps {
  exclusion: ExclusionDetail;
  onOpenDecisionDialog: () => void;
}

export function DecisionSection({ exclusion, onOpenDecisionDialog }: DecisionSectionProps) {
  const t = useTranslations('behaviour.exclusionDetail');

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <Gavel className="h-5 w-5 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('sections.decision')}</h3>
      </div>

      {exclusion.decision ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">{formatLabel(exclusion.decision)}</Badge>
            {exclusion.decision_date && (
              <span className="text-xs text-text-tertiary">
                Decided: {formatDate(exclusion.decision_date)}
              </span>
            )}
            {exclusion.decided_by && (
              <span className="text-xs text-text-tertiary">
                by {exclusion.decided_by.first_name} {exclusion.decided_by.last_name}
              </span>
            )}
          </div>
          {exclusion.decision_reasoning && (
            <div>
              <p className="text-xs font-medium text-text-tertiary">Reasoning</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                {exclusion.decision_reasoning}
              </p>
            </div>
          )}
          {exclusion.conditions_for_return && (
            <div>
              <p className="text-xs font-medium text-text-tertiary">Conditions for Return</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                {exclusion.conditions_for_return}
              </p>
            </div>
          )}
          {exclusion.conditions_for_transfer && (
            <div>
              <p className="text-xs font-medium text-text-tertiary">Conditions for Transfer</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                {exclusion.conditions_for_transfer}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-text-tertiary">{t('noDecision')}</p>
          <Button
            onClick={onOpenDecisionDialog}
            disabled={exclusion.status !== 'hearing_held' && exclusion.status !== 'decision_made'}
          >
            {t('recordDecision')}
          </Button>
          {exclusion.status !== 'hearing_held' && exclusion.status !== 'decision_made' && (
            <p className="mt-1 text-xs text-text-tertiary">{t('decisionAfterHearing')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── History Section ──────────────────────────────────────────────────────────

interface HistorySectionProps {
  history: HistoryEntry[];
  historyLoading: boolean;
}

export function ExclusionHistorySection({ history, historyLoading }: HistorySectionProps) {
  const t = useTranslations('behaviour.exclusionDetail');

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('sections.history')}</h3>
      {historyLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-surface-secondary" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('noHistory')}</p>
      ) : (
        <div className="relative space-y-4 ps-6">
          <div className="absolute start-2 top-1 h-full w-px bg-border" />
          {history.map((entry) => (
            <div key={entry.id} className="relative">
              <div className="absolute -start-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary-500 bg-surface" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium capitalize text-text-primary">
                    {entry.action.replace(/_/g, ' ')}
                  </span>
                  {entry.performed_by_user && (
                    <span className="text-xs text-text-tertiary">
                      by {entry.performed_by_user.first_name} {entry.performed_by_user.last_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-tertiary">{formatDateTime(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
