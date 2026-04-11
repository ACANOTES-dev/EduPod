'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, RotateCcw, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import type {
  MessagingRole,
  UpdateInboxSettingsDto,
  UpdateMessagingPolicyDto,
} from '@school/shared/inbox';
import { updateInboxSettingsSchema } from '@school/shared/inbox';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  cn,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { PolicyMatrixGrid } from './_components/policy-matrix-grid';
import type { InboxSettingsPayload, PolicyMatrixDict } from './_components/types';
import { MESSAGING_ROLES } from './_components/types';

interface InboxSettingsResponse {
  messaging_enabled: boolean;
  students_can_initiate: boolean;
  parents_can_initiate: boolean;
  parent_to_parent_messaging: boolean;
  student_to_student_messaging: boolean;
  student_to_parent_messaging: boolean;
  require_admin_approval_for_parent_to_teacher: boolean;
  edit_window_minutes: number;
  retention_days: number | null;
}

interface PolicyMatrixResponse {
  matrix: PolicyMatrixDict;
}

function computeDisabledCells(
  form: InboxSettingsPayload,
): Set<`${MessagingRole}:${MessagingRole}`> {
  const disabled = new Set<`${MessagingRole}:${MessagingRole}`>();
  if (!form.messaging_enabled) {
    for (const sender of MESSAGING_ROLES) {
      for (const recipient of MESSAGING_ROLES) {
        disabled.add(`${sender}:${recipient}`);
      }
    }
    return disabled;
  }
  if (!form.parent_to_parent_messaging) disabled.add('parent:parent');
  if (!form.student_to_student_messaging) disabled.add('student:student');
  if (!form.student_to_parent_messaging) disabled.add('student:parent');
  if (!form.students_can_initiate) {
    for (const recipient of MESSAGING_ROLES) {
      disabled.add(`student:${recipient}`);
    }
  }
  if (!form.parents_can_initiate) {
    for (const recipient of MESSAGING_ROLES) {
      disabled.add(`parent:${recipient}`);
    }
  }
  return disabled;
}

const DEFAULT_INBOX_SETTINGS: InboxSettingsPayload = {
  messaging_enabled: true,
  students_can_initiate: false,
  parents_can_initiate: false,
  parent_to_parent_messaging: false,
  student_to_student_messaging: false,
  student_to_parent_messaging: false,
  require_admin_approval_for_parent_to_teacher: false,
  edit_window_minutes: 10,
  retention_days: null,
};

function emptyMatrix(): PolicyMatrixDict {
  const m = {} as PolicyMatrixDict;
  for (const s of MESSAGING_ROLES) {
    m[s] = {} as Record<MessagingRole, boolean>;
    for (const r of MESSAGING_ROLES) m[s][r] = false;
  }
  return m;
}

export default function MessagingPolicyPage(): React.ReactElement {
  const t = useTranslations('messagingPolicyPage');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [matrix, setMatrix] = React.useState<PolicyMatrixDict>(emptyMatrix);
  const [confirmState, setConfirmState] = React.useState<
    | null
    | { kind: 'disable-messaging' }
    | { kind: 'enable-students' }
    | { kind: 'enable-parents' }
    | { kind: 'reset-defaults' }
  >(null);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<InboxSettingsPayload>({
    resolver: zodResolver(updateInboxSettingsSchema),
    defaultValues: DEFAULT_INBOX_SETTINGS,
  });

  const formValues = watch();
  const disabledCells = React.useMemo(() => computeDisabledCells(formValues), [formValues]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settings, policy] = await Promise.all([
          apiClient<InboxSettingsResponse | { data: InboxSettingsResponse }>(
            '/api/v1/inbox/settings/inbox',
          ),
          apiClient<PolicyMatrixResponse | { data: PolicyMatrixResponse }>(
            '/api/v1/inbox/settings/policy',
          ),
        ]);
        if (cancelled) return;

        const settingsBody =
          'data' in settings && settings.data ? settings.data : (settings as InboxSettingsResponse);
        const policyBody =
          'data' in policy && policy.data ? policy.data : (policy as PolicyMatrixResponse);

        reset({
          messaging_enabled: settingsBody.messaging_enabled,
          students_can_initiate: settingsBody.students_can_initiate,
          parents_can_initiate: settingsBody.parents_can_initiate,
          parent_to_parent_messaging: settingsBody.parent_to_parent_messaging,
          student_to_student_messaging: settingsBody.student_to_student_messaging,
          student_to_parent_messaging: settingsBody.student_to_parent_messaging,
          require_admin_approval_for_parent_to_teacher:
            settingsBody.require_admin_approval_for_parent_to_teacher,
          edit_window_minutes: settingsBody.edit_window_minutes,
          retention_days: settingsBody.retention_days,
        });
        setMatrix(policyBody.matrix);
      } catch (err) {
        console.error('[messaging-policy] load', err);
        if (!cancelled) toast.error(t('toast.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reset, t]);

  const [dirtyCells, setDirtyCells] = React.useState<Set<`${MessagingRole}:${MessagingRole}`>>(
    () => new Set(),
  );

  function toggleCell(sender: MessagingRole, recipient: MessagingRole) {
    setMatrix((prev) => ({
      ...prev,
      [sender]: { ...prev[sender], [recipient]: !prev[sender][recipient] },
    }));
    setDirtyCells((prev) => {
      const next = new Set(prev);
      next.add(`${sender}:${recipient}` as const);
      return next;
    });
  }

  async function save(values: InboxSettingsPayload) {
    setSaving(true);
    try {
      const settingsPayload: UpdateInboxSettingsDto = values;
      const cells: UpdateMessagingPolicyDto['cells'] = Array.from(dirtyCells).map((key) => {
        const [sender, recipient] = key.split(':') as [MessagingRole, MessagingRole];
        return {
          sender_role: sender,
          recipient_role: recipient,
          allowed: matrix[sender][recipient],
        };
      });

      const requests: Promise<unknown>[] = [
        apiClient('/api/v1/inbox/settings/inbox', {
          method: 'PUT',
          body: JSON.stringify(settingsPayload),
        }),
      ];
      if (cells.length > 0) {
        requests.push(
          apiClient('/api/v1/inbox/settings/policy', {
            method: 'PUT',
            body: JSON.stringify({ cells }),
          }),
        );
      }
      await Promise.all(requests);

      toast.success(t('toast.saveSuccess'));
      reset(values);
      setDirtyCells(new Set());
    } catch (err) {
      console.error('[messaging-policy] save', err);
      const msg = err instanceof Error ? err.message : t('toast.saveFailed');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function doReset() {
    setSaving(true);
    try {
      const res = await apiClient<PolicyMatrixResponse | { data: PolicyMatrixResponse }>(
        '/api/v1/inbox/settings/policy/reset',
        { method: 'POST' },
      );
      const body = 'data' in res && res.data ? res.data : (res as PolicyMatrixResponse);
      setMatrix(body.matrix);
      setDirtyCells(new Set());
      toast.success(t('toast.resetSuccess'));
    } catch (err) {
      console.error('[messaging-policy] reset', err);
      toast.error(t('toast.resetFailed'));
    } finally {
      setSaving(false);
      setConfirmState(null);
    }
  }

  function guardedSwitch(
    field: keyof InboxSettingsPayload,
    checked: boolean,
    onChange: (v: boolean) => void,
  ) {
    if (field === 'messaging_enabled' && !checked) {
      setConfirmState({ kind: 'disable-messaging' });
      return;
    }
    if (field === 'students_can_initiate' && checked) {
      setConfirmState({ kind: 'enable-students' });
      return;
    }
    if (field === 'parents_can_initiate' && checked) {
      setConfirmState({ kind: 'enable-parents' });
      return;
    }
    onChange(checked);
  }

  function confirmToggle() {
    if (!confirmState) return;
    switch (confirmState.kind) {
      case 'disable-messaging':
        setValue('messaging_enabled', false, { shouldDirty: true });
        break;
      case 'enable-students':
        setValue('students_can_initiate', true, { shouldDirty: true });
        break;
      case 'enable-parents':
        setValue('parents_can_initiate', true, { shouldDirty: true });
        break;
      case 'reset-defaults':
        void doReset();
        return;
    }
    setConfirmState(null);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} description={t('loading')} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(save)} className="space-y-6 pb-24">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmState({ kind: 'reset-defaults' })}
          >
            <RotateCcw className="me-2 h-4 w-4" />
            {t('resetDefaults')}
          </Button>
        }
      />

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-text-primary">{t('sections.global.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('sections.global.description')}</p>
        </header>

        <div className="space-y-4">
          <ToggleRow
            label={t('toggles.messagingEnabled')}
            description={t('toggles.messagingEnabledHint')}
            control={control}
            name="messaging_enabled"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label={t('toggles.studentsInitiate')}
            description={t('toggles.studentsInitiateHint')}
            warning={formValues.students_can_initiate}
            warningText={t('toggles.checkMatrixWarning')}
            control={control}
            name="students_can_initiate"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label={t('toggles.parentsInitiate')}
            description={t('toggles.parentsInitiateHint')}
            warning={formValues.parents_can_initiate}
            warningText={t('toggles.checkMatrixWarning')}
            control={control}
            name="parents_can_initiate"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label={t('toggles.parentParent')}
            description={t('toggles.parentParentHint')}
            control={control}
            name="parent_to_parent_messaging"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label={t('toggles.studentStudent')}
            description={t('toggles.studentStudentHint')}
            control={control}
            name="student_to_student_messaging"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label={t('toggles.studentParent')}
            description={t('toggles.studentParentHint')}
            control={control}
            name="student_to_parent_messaging"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label={t('toggles.requireAdminApproval')}
            description={t('toggles.requireAdminApprovalHint')}
            control={control}
            name="require_admin_approval_for_parent_to_teacher"
            onGuard={guardedSwitch}
            comingSoon
            comingSoonLabel={t('toggles.comingSoon')}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-text-primary">{t('sections.matrix.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('sections.matrix.description')}</p>
        </header>
        <PolicyMatrixGrid
          matrix={matrix}
          disabledCells={disabledCells}
          onToggle={toggleCell}
          readOnly={saving}
        />
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('sections.editingRetention.title')}
          </h2>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit_window_minutes">{t('sections.editingRetention.editWindow')}</Label>
            <Controller
              control={control}
              name="edit_window_minutes"
              render={({ field }) => (
                <Input
                  id="edit_window_minutes"
                  type="number"
                  min={0}
                  max={60}
                  inputMode="numeric"
                  className="mt-1"
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              )}
            />
            <p className="mt-1 text-xs text-text-secondary">
              {t('sections.editingRetention.editWindowHint')}
            </p>
            {errors.edit_window_minutes && (
              <p className="mt-1 text-xs text-danger-text">{errors.edit_window_minutes.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="retention_days">{t('sections.editingRetention.retention')}</Label>
            <Controller
              control={control}
              name="retention_days"
              render={({ field }) => (
                <Input
                  id="retention_days"
                  type="number"
                  min={30}
                  max={3650}
                  inputMode="numeric"
                  placeholder={t('sections.editingRetention.retentionPlaceholder')}
                  className="mt-1"
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    field.onChange(raw === '' ? null : Number(raw));
                  }}
                />
              )}
            />
            <p className="mt-1 text-xs text-text-secondary">
              {t('sections.editingRetention.retentionHint')}
            </p>
            {errors.retention_days && (
              <p className="mt-1 text-xs text-danger-text">{errors.retention_days.message}</p>
            )}
          </div>
        </div>
        <div
          className="mt-4 rounded-md border border-border bg-surface-secondary p-3 text-xs text-text-secondary"
          dangerouslySetInnerHTML={{
            __html: t.raw('sections.editingRetention.gdprNote') as string,
          }}
        />
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-surface px-4 py-3 sm:-mx-6 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <p
          className={cn(
            'text-sm',
            isDirty || dirtyCells.size > 0 ? 'text-warning-text' : 'text-text-secondary',
          )}
        >
          {isDirty || dirtyCells.size > 0 ? t('saveBar.dirty') : t('saveBar.clean')}
        </p>
        <Button type="submit" disabled={saving || (!isDirty && dirtyCells.size === 0)}>
          <Save className="me-2 h-4 w-4" />
          {saving ? t('saveBar.saving') : t('saveBar.save')}
        </Button>
      </div>

      <Dialog open={confirmState !== null} onOpenChange={(open) => !open && setConfirmState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning-text" />
              {confirmState?.kind === 'disable-messaging' && t('confirm.disableMessaging.title')}
              {confirmState?.kind === 'enable-students' && t('confirm.enableStudents.title')}
              {confirmState?.kind === 'enable-parents' && t('confirm.enableParents.title')}
              {confirmState?.kind === 'reset-defaults' && t('confirm.resetDefaults.title')}
            </DialogTitle>
            <DialogDescription>
              {confirmState?.kind === 'disable-messaging' && t('confirm.disableMessaging.body')}
              {confirmState?.kind === 'enable-students' && t('confirm.enableStudents.body')}
              {confirmState?.kind === 'enable-parents' && t('confirm.enableParents.body')}
              {confirmState?.kind === 'reset-defaults' && t('confirm.resetDefaults.body')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmState(null)}>
              {t('confirm.cancel')}
            </Button>
            <Button
              type="button"
              variant={confirmState?.kind === 'disable-messaging' ? 'destructive' : 'default'}
              onClick={confirmToggle}
            >
              {t('confirm.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  control: ReturnType<typeof useForm<InboxSettingsPayload>>['control'];
  name: keyof InboxSettingsPayload;
  onGuard: (
    field: keyof InboxSettingsPayload,
    checked: boolean,
    onChange: (v: boolean) => void,
  ) => void;
  warning?: boolean;
  warningText?: string;
  comingSoon?: boolean;
  comingSoonLabel?: string;
}

function ToggleRow({
  label,
  description,
  control,
  name,
  onGuard,
  warning,
  warningText,
  comingSoon,
  comingSoonLabel,
}: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {comingSoon && comingSoonLabel && (
            <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
              {comingSoonLabel}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
        {warning && warningText && <p className="mt-1 text-xs text-warning-text">{warningText}</p>}
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => onGuard(name, checked, field.onChange)}
          />
        )}
      />
    </div>
  );
}
