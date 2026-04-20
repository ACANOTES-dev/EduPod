'use client';

import { Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import {
  DOCUMENT_SEND_CHANNELS,
  type DocumentRow,
  type DocumentSendChannel,
  type StudentParentOption,
} from './document-types';

interface SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DocumentRow;
  onSent: (doc: DocumentRow) => void;
}

interface ChannelOption {
  key: DocumentSendChannel;
  disabled: boolean;
  /** Non-null when the channel is disabled — rendered inside a tooltip. */
  disabledReason: string | null;
}

export function SendDocumentDialog({ open, onOpenChange, document, onSent }: SendDialogProps) {
  const t = useTranslations('documentGen.send');
  const tChannels = useTranslations('documentGen.channels');

  const [parents, setParents] = React.useState<StudentParentOption[]>([]);
  const [parentsLoading, setParentsLoading] = React.useState(false);
  const [selectedParents, setSelectedParents] = React.useState<Set<string>>(new Set());
  const [selectedChannels, setSelectedChannels] = React.useState<Set<DocumentSendChannel>>(
    new Set(['in_app']),
  );
  const [coverMessage, setCoverMessage] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load the student's guardians as the recipient pool. The picker is seeded
  // to include the primary contact by default — this is the common case for
  // parent-bound letters. For other channels (print) no recipient is required.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setCoverMessage('');
    setSelectedChannels(new Set(['in_app']));
    setSelectedParents(new Set());
    if (!document.student_id) {
      setParents([]);
      return;
    }
    let cancelled = false;
    setParentsLoading(true);
    apiClient<{ data: StudentDetailResponse }>(`/api/v1/students/${document.student_id}`)
      .then((res) => {
        if (cancelled) return;
        const links = res.data?.student_parents ?? [];
        const mapped: StudentParentOption[] = links
          .filter((link): link is StudentParentLink & { parent: ParentResponse } => !!link.parent)
          .map((link) => ({
            parent_id: link.parent.id,
            first_name: link.parent.first_name,
            last_name: link.parent.last_name,
            email: link.parent.email,
            phone: link.parent.phone,
            is_primary_contact: link.parent.is_primary_contact,
            has_user_account: !!link.parent.user_id,
          }));
        setParents(mapped);
        const primary = mapped.find((p) => p.is_primary_contact);
        if (primary) {
          setSelectedParents(new Set([primary.parent_id]));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[SendDocumentDialog.loadParents]', err);
      })
      .finally(() => {
        if (!cancelled) setParentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, document.student_id]);

  // Build the channel list. In-app is always on; WhatsApp is stubbed on the
  // backend so we still let users tick it but surface a tooltip warning (per
  // impl-06 follow-up + impl-20 "Watch out for" WhatsApp guidance).
  const channelOptions = React.useMemo<ChannelOption[]>(() => {
    return DOCUMENT_SEND_CHANNELS.map((key) => {
      if (key === 'in_app') return { key, disabled: true, disabledReason: null };
      if (key === 'whatsapp') {
        return { key, disabled: false, disabledReason: t('whatsappNotWired') };
      }
      return { key, disabled: false, disabledReason: null };
    });
  }, [t]);

  const toggleParent = (parentId: string) => {
    setSelectedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const toggleChannel = (channel: DocumentSendChannel) => {
    if (channel === 'in_app') return;
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) {
        next.delete(channel);
      } else {
        next.add(channel);
      }
      return next;
    });
  };

  const needsRecipient = React.useMemo(
    () => Array.from(selectedChannels).some((c) => c !== 'print'),
    [selectedChannels],
  );

  const canSubmit =
    selectedChannels.size > 0 && (!needsRecipient || selectedParents.size > 0) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    // Impl 06 did not ship a multi-recipient send endpoint, so the client
    // fans out one `POST /:id/send` per (channel × recipient) pair.
    // Print-only sends bypass the recipient loop entirely — the backend
    // treats `recipient_parent_id` as optional for print.
    const plan: Array<{ channel: DocumentSendChannel; recipient_parent_id?: string }> = [];
    for (const channel of selectedChannels) {
      if (channel === 'print') {
        plan.push({ channel });
      } else if (selectedParents.size === 0) {
        // Channel requested without recipients — skipped. Defensive; UI
        // disables the button when this happens, but belt-and-braces.
        continue;
      } else {
        for (const parentId of selectedParents) {
          plan.push({ channel, recipient_parent_id: parentId });
        }
      }
    }

    let lastDoc: DocumentRow = document;
    const failures: string[] = [];

    for (const step of plan) {
      try {
        const res = await apiClient<{ data: DocumentRow }>(
          `/api/v1/behaviour/documents/${document.id}/send`,
          {
            method: 'POST',
            body: JSON.stringify(step),
            silent: true,
          },
        );
        lastDoc = res.data;
      } catch (err: unknown) {
        const ex = err as { error?: { message?: string } };
        failures.push(ex?.error?.message ?? t('errorFallback'));
      }
    }

    setSubmitting(false);

    if (failures.length === plan.length) {
      setError(failures[0] ?? t('errorFallback'));
      return;
    }
    if (failures.length > 0) {
      toast.warning(
        t('partialSuccess', { count: plan.length - failures.length, total: plan.length }),
      );
    } else {
      toast.success(t('successToast'));
    }
    onSent(lastDoc);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <section className="space-y-2">
            <Label>{t('recipientsLabel')}</Label>
            {parentsLoading ? (
              <div className="h-24 animate-pulse rounded-md bg-surface-secondary" />
            ) : parents.length === 0 ? (
              <p className="rounded-md bg-surface-secondary p-3 text-sm text-text-tertiary">
                {t('noRecipients')}
              </p>
            ) : (
              <div className="space-y-1">
                {parents.map((parent) => {
                  const checked = selectedParents.has(parent.parent_id);
                  return (
                    <label
                      key={parent.parent_id}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-2 hover:bg-surface-secondary"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleParent(parent.parent_id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
                          {parent.first_name} {parent.last_name}
                          {parent.is_primary_contact && (
                            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">
                              {t('primaryContact')}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-text-tertiary">
                          {parent.email ?? t('noEmail')}
                          {parent.has_user_account ? '' : ` · ${t('noUserAccount')}`}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <Label>{t('channelsLabel')}</Label>
            <TooltipProvider>
              <div className="grid gap-2 sm:grid-cols-2">
                {channelOptions.map((option) => {
                  const checked = option.key === 'in_app' ? true : selectedChannels.has(option.key);
                  const content = (
                    <label
                      key={option.key}
                      className={`flex items-center gap-2 rounded-md border p-2 ${
                        option.disabled
                          ? 'cursor-default opacity-75'
                          : 'cursor-pointer hover:bg-surface-secondary'
                      } ${checked ? 'border-accent bg-accent/5' : 'border-border'}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={option.disabled}
                        onCheckedChange={() => toggleChannel(option.key)}
                      />
                      <span className="text-sm font-medium text-text-primary">
                        {tChannels(option.key)}
                      </span>
                      {option.key === 'in_app' && (
                        <span className="ms-auto text-[11px] text-text-tertiary">
                          {t('alwaysOn')}
                        </span>
                      )}
                    </label>
                  );
                  return option.disabledReason ? (
                    <Tooltip key={option.key}>
                      <TooltipTrigger asChild>
                        <div>{content}</div>
                      </TooltipTrigger>
                      <TooltipContent>{option.disabledReason}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <div key={option.key}>{content}</div>
                  );
                })}
              </div>
            </TooltipProvider>
          </section>

          <section className="space-y-2">
            <Label htmlFor="send-cover-message">{t('coverMessageLabel')}</Label>
            <Textarea
              id="send-cover-message"
              value={coverMessage}
              onChange={(e) => setCoverMessage(e.target.value)}
              placeholder={t('coverMessagePlaceholder')}
              rows={3}
            />
            <p className="text-xs text-text-tertiary">{t('coverMessageHint')}</p>
          </section>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text"
            >
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="me-1 h-4 w-4 animate-spin" aria-hidden />
                {t('sending')}
              </>
            ) : (
              <>
                <Send className="me-1 h-4 w-4" aria-hidden />
                {t('send')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Wire types for student detail response (narrow) ──────────────────────────

interface ParentResponse {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_primary_contact: boolean;
  user_id: string | null;
}

interface StudentParentLink {
  parent: ParentResponse | null;
}

interface StudentDetailResponse {
  student_parents: StudentParentLink[];
}
