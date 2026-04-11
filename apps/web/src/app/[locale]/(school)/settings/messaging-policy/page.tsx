'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, RotateCcw, Save } from 'lucide-react';
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
  const disabledCells = React.useMemo(
    () => computeDisabledCells(formValues),
    [formValues],
  );

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
        if (!cancelled) toast.error('Failed to load messaging policy.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reset]);

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

      toast.success('Messaging policy saved.');
      reset(values);
      setDirtyCells(new Set());
    } catch (err) {
      console.error('[messaging-policy] save', err);
      const msg = err instanceof Error ? err.message : 'Failed to save messaging policy.';
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
      toast.success('Matrix reset to defaults.');
    } catch (err) {
      console.error('[messaging-policy] reset', err);
      toast.error('Failed to reset the matrix.');
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
        <PageHeader title="Messaging Policy" description="Loading…" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(save)} className="space-y-6 pb-24">
      <PageHeader
        title="Messaging Policy"
        description="Configure who can message whom in the inbox, the edit window, and message retention."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmState({ kind: 'reset-defaults' })}
          >
            <RotateCcw className="me-2 h-4 w-4" />
            Reset to defaults
          </Button>
        }
      />

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Global controls</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Master kill switches — these apply before the role-pair matrix.
          </p>
        </header>

        <div className="space-y-4">
          <ToggleRow
            label="Messaging enabled"
            description="Master switch for the whole inbox. Turning this off disables messaging for everyone."
            control={control}
            name="messaging_enabled"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label="Students can initiate conversations"
            description="When off, students can only reply on threads where the sender allowed replies."
            warning={formValues.students_can_initiate}
            control={control}
            name="students_can_initiate"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label="Parents can initiate conversations"
            description="When off, parents can only reply on threads where the sender allowed replies."
            warning={formValues.parents_can_initiate}
            control={control}
            name="parents_can_initiate"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label="Allow parent ↔ parent messaging"
            description="Parents can message other parents at this school. Off by default for privacy."
            control={control}
            name="parent_to_parent_messaging"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label="Allow student ↔ student messaging"
            description="Students can message other students at this school. Off by default for safeguarding."
            control={control}
            name="student_to_student_messaging"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label="Allow student → parent messaging"
            description="Students can initiate conversations with parents."
            control={control}
            name="student_to_parent_messaging"
            onGuard={guardedSwitch}
          />
          <ToggleRow
            label="Require admin approval for parent → teacher messages"
            description="Parent-to-teacher messages are queued for admin approval before delivery."
            control={control}
            name="require_admin_approval_for_parent_to_teacher"
            onGuard={guardedSwitch}
            comingSoon
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Role permission matrix</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Toggle cells to allow or block a sender role from initiating conversations with a
            recipient role. Greyed cells are disabled by a global kill switch above. Hardcoded
            relational scopes (e.g. teacher → parent of own students) still apply on top of the
            matrix.
          </p>
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
          <h2 className="text-lg font-semibold text-text-primary">Editing & retention</h2>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit_window_minutes">Edit window (minutes)</Label>
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
              Senders (school staff only) can edit their messages for this many minutes after
              sending. Set to 0 to disable editing.
            </p>
            {errors.edit_window_minutes && (
              <p className="mt-1 text-xs text-danger-text">{errors.edit_window_minutes.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="retention_days">Retention period (days)</Label>
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
                  placeholder="Forever"
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
              Messages older than this are deleted automatically. Leave blank to keep messages
              forever.
            </p>
            {errors.retention_days && (
              <p className="mt-1 text-xs text-danger-text">{errors.retention_days.message}</p>
            )}
          </div>
        </div>
        <div className="mt-4 rounded-md border border-border bg-surface-secondary p-3 text-xs text-text-secondary">
          <strong>GDPR note:</strong> Setting a retention period helps comply with data
          minimisation. The platform deletes messages permanently — for safeguarding records,
          export important conversations before retention runs. (Retention enforcement runs in a
          future worker — the setting is captured now.)
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-surface px-4 py-3 sm:-mx-6 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <p
          className={cn(
            'text-sm',
            isDirty || dirtyCells.size > 0 ? 'text-warning-text' : 'text-text-secondary',
          )}
        >
          {isDirty || dirtyCells.size > 0
            ? 'You have unsaved changes.'
            : 'All changes saved.'}
        </p>
        <Button type="submit" disabled={saving || (!isDirty && dirtyCells.size === 0)}>
          <Save className="me-2 h-4 w-4" />
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <Dialog open={confirmState !== null} onOpenChange={(open) => !open && setConfirmState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning-text" />
              {confirmState?.kind === 'disable-messaging' && 'Disable messaging?'}
              {confirmState?.kind === 'enable-students' && 'Let students initiate?'}
              {confirmState?.kind === 'enable-parents' && 'Let parents initiate?'}
              {confirmState?.kind === 'reset-defaults' && 'Reset matrix to defaults?'}
            </DialogTitle>
            <DialogDescription>
              {confirmState?.kind === 'disable-messaging' &&
                'This disables the entire inbox for everyone in your school. Users will be unable to send or read new messages. Are you sure?'}
              {confirmState?.kind === 'enable-students' &&
                'This lets students initiate conversations with anyone the matrix allows. Make sure your matrix is configured appropriately before turning this on.'}
              {confirmState?.kind === 'enable-parents' &&
                'This lets parents initiate conversations with anyone the matrix allows. Make sure your matrix is configured appropriately before turning this on.'}
              {confirmState?.kind === 'reset-defaults' &&
                'This resets the 9×9 matrix to the platform defaults. Your custom configuration will be lost. Kill switches and edit/retention settings are not affected.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmState(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirmState?.kind === 'disable-messaging' ? 'destructive' : 'default'}
              onClick={confirmToggle}
            >
              Confirm
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
  comingSoon?: boolean;
}

function ToggleRow({
  label,
  description,
  control,
  name,
  onGuard,
  warning,
  comingSoon,
}: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {comingSoon && (
            <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
              Coming soon
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
        {warning && (
          <p className="mt-1 text-xs text-warning-text">
            Warning: check your matrix below before enabling.
          </p>
        )}
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
