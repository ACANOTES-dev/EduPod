'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, Switch, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Settings shape ──────────────────────────────────────────────────────────

interface BehaviourSettings {
  // Quick-log
  quick_log_default_polarity: 'positive' | 'negative';
  quick_log_auto_submit: boolean;
  quick_log_recent_students_count: number;
  quick_log_show_favourites: boolean;

  // Points
  points_enabled: boolean;
  points_reset_frequency: 'never' | 'academic_year' | 'academic_period';

  // House teams
  house_teams_enabled: boolean;
  house_points_visible_to_students: boolean;
  house_leaderboard_public: boolean;

  // Awards
  auto_awards_enabled: boolean;

  // Sanctions
  detention_default_duration_minutes: number;
  suspension_requires_approval: boolean;
  expulsion_requires_approval: boolean;

  // Parent visibility
  parent_portal_behaviour_enabled: boolean;
  parent_notification_negative_severity_threshold: number;
  parent_notification_positive_always: boolean;
  parent_notification_digest_enabled: boolean;
  parent_notification_digest_time: string;
  parent_acknowledgement_required_severity: number;
  parent_visibility_show_teacher_name: boolean;

  // Recognition wall
  recognition_wall_enabled: boolean;
  recognition_wall_public: boolean;
  recognition_wall_requires_consent: boolean;

  // Safeguarding
  safeguarding_sla_critical_hours: number;
  safeguarding_sla_high_hours: number;
  safeguarding_sla_medium_hours: number;
  safeguarding_sla_low_hours: number;

  // Analytics & AI
  behaviour_pulse_enabled: boolean;
  ai_insights_enabled: boolean;
  ai_narrative_enabled: boolean;
  ai_nl_query_enabled: boolean;
  ai_confidence_threshold: number;
  ai_diagnostic_language_blocked: boolean;
}

const DEFAULT_SETTINGS: BehaviourSettings = {
  quick_log_default_polarity: 'positive',
  quick_log_auto_submit: true,
  quick_log_recent_students_count: 5,
  quick_log_show_favourites: true,

  points_enabled: true,
  points_reset_frequency: 'academic_year',

  house_teams_enabled: false,
  house_points_visible_to_students: true,
  house_leaderboard_public: false,

  auto_awards_enabled: true,

  detention_default_duration_minutes: 30,
  suspension_requires_approval: true,
  expulsion_requires_approval: true,

  parent_portal_behaviour_enabled: true,
  parent_notification_negative_severity_threshold: 3,
  parent_notification_positive_always: true,
  parent_notification_digest_enabled: false,
  parent_notification_digest_time: '16:00',
  parent_acknowledgement_required_severity: 5,
  parent_visibility_show_teacher_name: false,

  recognition_wall_enabled: true,
  recognition_wall_public: false,
  recognition_wall_requires_consent: true,

  safeguarding_sla_critical_hours: 4,
  safeguarding_sla_high_hours: 24,
  safeguarding_sla_medium_hours: 72,
  safeguarding_sla_low_hours: 168,

  behaviour_pulse_enabled: true,
  ai_insights_enabled: true,
  ai_narrative_enabled: true,
  ai_nl_query_enabled: true,
  ai_confidence_threshold: 0.85,
  ai_diagnostic_language_blocked: true,
};

// ─── Section UI helpers ──────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between px-6 py-4 text-start transition-colors hover:bg-surface-secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          {description && <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-text-tertiary" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
        )}
      </button>
      {open && <div className="space-y-4 border-t border-border px-6 py-5">{children}</div>}
    </div>
  );
}

function BooleanRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && <p className="text-xs text-text-tertiary">{description}</p>}
      </div>
      <Switch id={id} checked={value} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}

function NumberRow({
  label,
  description,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && <p className="text-xs text-text-tertiary">{description}</p>}
      </div>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(n);
        }}
        min={min}
        max={max}
        className="w-full shrink-0 text-end sm:w-28"
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourGeneralSettingsPage() {
  const t = useTranslations('behaviourSettings.general');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [settings, setSettings] = React.useState<BehaviourSettings>(DEFAULT_SETTINGS);

  React.useEffect(() => {
    apiClient<{
      data?: { behaviour?: Partial<BehaviourSettings> };
      behaviour?: Partial<BehaviourSettings>;
    }>('/api/v1/settings')
      .then((res) => {
        const root = 'data' in res && res.data ? res.data : res;
        const beh = root.behaviour;
        if (beh && typeof beh === 'object') {
          setSettings((prev) => ({ ...prev, ...beh }));
        }
      })
      .catch(() => {
        /* use defaults */
      })
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof BehaviourSettings>(key: K, value: BehaviourSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ behaviour: settings }),
      });
      toast.success(t('toasts.saved'));
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      toast.error(ex?.error?.message ?? t('toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave}>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button type="submit" disabled={saving}>
            {saving ? t('saving') : t('saveChanges')}
          </Button>
        }
      />

      <div className="mt-6 space-y-4">
        {/* Quick-Log */}
        <SectionCard title={t('sections.quickLog')} description={t('sections.quickLogDesc')}>
          <BooleanRow
            label={t('labels.autoSubmit')}
            description={t('descriptions.autoSubmit')}
            value={settings.quick_log_auto_submit}
            onChange={(v) => update('quick_log_auto_submit', v)}
          />
          <NumberRow
            label={t('labels.recentStudentsCount')}
            description={t('descriptions.recentStudentsCount')}
            value={settings.quick_log_recent_students_count}
            onChange={(v) => update('quick_log_recent_students_count', v)}
            min={1}
            max={50}
          />
          <BooleanRow
            label={t('labels.showFavourites')}
            description={t('descriptions.showFavourites')}
            value={settings.quick_log_show_favourites}
            onChange={(v) => update('quick_log_show_favourites', v)}
          />
        </SectionCard>

        {/* Points */}
        <SectionCard title={t('sections.points')} description={t('sections.pointsDesc')}>
          <BooleanRow
            label={t('labels.pointsEnabled')}
            description={t('descriptions.pointsEnabled')}
            value={settings.points_enabled}
            onChange={(v) => update('points_enabled', v)}
          />
        </SectionCard>

        {/* House Teams */}
        <SectionCard title={t('sections.houseTeams')} description={t('sections.houseTeamsDesc')}>
          <BooleanRow
            label={t('labels.houseTeamsEnabled')}
            description={t('descriptions.houseTeamsEnabled')}
            value={settings.house_teams_enabled}
            onChange={(v) => update('house_teams_enabled', v)}
          />
          {settings.house_teams_enabled && (
            <>
              <BooleanRow
                label={t('labels.pointsVisibleToStudents')}
                value={settings.house_points_visible_to_students}
                onChange={(v) => update('house_points_visible_to_students', v)}
              />
              <BooleanRow
                label={t('labels.publicLeaderboard')}
                value={settings.house_leaderboard_public}
                onChange={(v) => update('house_leaderboard_public', v)}
              />
            </>
          )}
        </SectionCard>

        {/* Awards */}
        <SectionCard title={t('sections.awards')} description={t('sections.awardsDesc')}>
          <BooleanRow
            label={t('labels.autoAwardsEnabled')}
            description={t('descriptions.autoAwardsEnabled')}
            value={settings.auto_awards_enabled}
            onChange={(v) => update('auto_awards_enabled', v)}
          />
        </SectionCard>

        {/* Sanctions */}
        <SectionCard title={t('sections.sanctions')} description={t('sections.sanctionsDesc')}>
          <NumberRow
            label={t('labels.detentionDuration')}
            value={settings.detention_default_duration_minutes}
            onChange={(v) => update('detention_default_duration_minutes', v)}
            min={5}
            max={480}
          />
          <BooleanRow
            label={t('labels.suspensionRequiresApproval')}
            value={settings.suspension_requires_approval}
            onChange={(v) => update('suspension_requires_approval', v)}
          />
          <BooleanRow
            label={t('labels.expulsionRequiresApproval')}
            value={settings.expulsion_requires_approval}
            onChange={(v) => update('expulsion_requires_approval', v)}
          />
        </SectionCard>

        {/* Parent Visibility */}
        <SectionCard
          title={t('sections.parentVisibility')}
          description={t('sections.parentVisibilityDesc')}
        >
          <BooleanRow
            label={t('labels.parentPortalEnabled')}
            value={settings.parent_portal_behaviour_enabled}
            onChange={(v) => update('parent_portal_behaviour_enabled', v)}
          />
          <NumberRow
            label={t('labels.negativeThreshold')}
            description={t('descriptions.negativeThreshold')}
            value={settings.parent_notification_negative_severity_threshold}
            onChange={(v) => update('parent_notification_negative_severity_threshold', v)}
            min={1}
            max={10}
          />
          <BooleanRow
            label={t('labels.notifyPositiveAlways')}
            description={t('descriptions.notifyPositiveAlways')}
            value={settings.parent_notification_positive_always}
            onChange={(v) => update('parent_notification_positive_always', v)}
          />
          <BooleanRow
            label={t('labels.digestNotifications')}
            description={t('descriptions.digestNotifications')}
            value={settings.parent_notification_digest_enabled}
            onChange={(v) => update('parent_notification_digest_enabled', v)}
          />
          <NumberRow
            label={t('labels.ackRequiredSeverity')}
            description={t('descriptions.ackRequiredSeverity')}
            value={settings.parent_acknowledgement_required_severity}
            onChange={(v) => update('parent_acknowledgement_required_severity', v)}
            min={1}
            max={10}
          />
          <BooleanRow
            label={t('labels.showTeacherName')}
            value={settings.parent_visibility_show_teacher_name}
            onChange={(v) => update('parent_visibility_show_teacher_name', v)}
          />
        </SectionCard>

        {/* Recognition Wall */}
        <SectionCard
          title={t('sections.recognitionWall')}
          description={t('sections.recognitionWallDesc')}
        >
          <BooleanRow
            label={t('labels.recognitionWallEnabled')}
            value={settings.recognition_wall_enabled}
            onChange={(v) => update('recognition_wall_enabled', v)}
          />
          {settings.recognition_wall_enabled && (
            <>
              <BooleanRow
                label={t('labels.recognitionWallPublic')}
                description={t('descriptions.recognitionWallPublic')}
                value={settings.recognition_wall_public}
                onChange={(v) => update('recognition_wall_public', v)}
              />
              <BooleanRow
                label={t('labels.requiresStudentConsent')}
                value={settings.recognition_wall_requires_consent}
                onChange={(v) => update('recognition_wall_requires_consent', v)}
              />
            </>
          )}
        </SectionCard>

        {/* Safeguarding */}
        <SectionCard
          title={t('sections.safeguarding')}
          description={t('sections.safeguardingDesc')}
        >
          <NumberRow
            label={t('labels.criticalSla')}
            value={settings.safeguarding_sla_critical_hours}
            onChange={(v) => update('safeguarding_sla_critical_hours', v)}
            min={1}
            max={168}
          />
          <NumberRow
            label={t('labels.highSla')}
            value={settings.safeguarding_sla_high_hours}
            onChange={(v) => update('safeguarding_sla_high_hours', v)}
            min={1}
            max={168}
          />
          <NumberRow
            label={t('labels.mediumSla')}
            value={settings.safeguarding_sla_medium_hours}
            onChange={(v) => update('safeguarding_sla_medium_hours', v)}
            min={1}
            max={336}
          />
          <NumberRow
            label={t('labels.lowSla')}
            value={settings.safeguarding_sla_low_hours}
            onChange={(v) => update('safeguarding_sla_low_hours', v)}
            min={1}
            max={672}
          />
        </SectionCard>

        {/* Analytics & AI */}
        <SectionCard title={t('sections.analyticsAi')} description={t('sections.analyticsAiDesc')}>
          <BooleanRow
            label={t('labels.behaviourPulse')}
            value={settings.behaviour_pulse_enabled}
            onChange={(v) => update('behaviour_pulse_enabled', v)}
          />
          <BooleanRow
            label={t('labels.aiInsights')}
            description={t('descriptions.aiInsights')}
            value={settings.ai_insights_enabled}
            onChange={(v) => update('ai_insights_enabled', v)}
          />
          <BooleanRow
            label={t('labels.aiNarrative')}
            description={t('descriptions.aiNarrative')}
            value={settings.ai_narrative_enabled}
            onChange={(v) => update('ai_narrative_enabled', v)}
          />
          <BooleanRow
            label={t('labels.nlQueries')}
            description={t('descriptions.nlQueries')}
            value={settings.ai_nl_query_enabled}
            onChange={(v) => update('ai_nl_query_enabled', v)}
          />
          <BooleanRow
            label={t('labels.blockDiagnosticLanguage')}
            description={t('descriptions.blockDiagnosticLanguage')}
            value={settings.ai_diagnostic_language_blocked}
            onChange={(v) => update('ai_diagnostic_language_blocked', v)}
          />
        </SectionCard>
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
      </div>
    </form>
  );
}
