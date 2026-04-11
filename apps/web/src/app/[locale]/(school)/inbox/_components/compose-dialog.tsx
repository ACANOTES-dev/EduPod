'use client';

import { Loader2, MessageSquare, Megaphone, Send, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { AttachmentInput, ConversationKind, InboxChannel } from '@school/shared/inbox';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { AttachmentUploader } from './attachment-uploader';
import { AudiencePicker, type AudiencePickerValue } from './audience-picker';
import { ChannelSelector } from './channel-selector';
import { PeoplePicker } from './people-picker';

/**
 * ComposeDialog — the compose-new-message surface for the inbox. A
 * single dialog with three tabs (Direct, Group, Broadcast) mapping to
 * the three conversation kinds in `PLAN.md` §2.
 *
 * Per-tab state is kept in local state rather than one `react-hook-form`
 * — the three tabs have different shapes and validation requirements,
 * and each tab builds its own `CreateConversationDto` at submit time.
 * The backend Zod schema is the single source of truth.
 */

type ExtraChannel = Exclude<InboxChannel, 'inbox'>;

interface PickedUser {
  user_id: string;
  display_name: string;
  role_label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: ConversationKind;
}

const TABS: Array<{ kind: ConversationKind; labelKey: string; icon: React.ElementType }> = [
  { kind: 'direct', labelKey: 'inbox.compose.tabs.direct', icon: MessageSquare },
  { kind: 'group', labelKey: 'inbox.compose.tabs.group', icon: Users },
  { kind: 'broadcast', labelKey: 'inbox.compose.tabs.broadcast', icon: Megaphone },
];

export function ComposeDialog({ open, onOpenChange, initialTab = 'direct' }: Props) {
  const router = useRouter();
  const t = useTranslations();
  const [kind, setKind] = React.useState<ConversationKind>(initialTab);

  const [directRecipient, setDirectRecipient] = React.useState<PickedUser | null>(null);

  const [groupSubject, setGroupSubject] = React.useState('');
  const [groupRecipients, setGroupRecipients] = React.useState<PickedUser[]>([]);

  const [broadcastSubject, setBroadcastSubject] = React.useState('');
  const [audience, setAudience] = React.useState<AudiencePickerValue | null>(null);
  const [allowReplies, setAllowReplies] = React.useState(false);

  const [body, setBody] = React.useState('');
  const [attachments, setAttachments] = React.useState<AttachmentInput[]>([]);
  const [extraChannels, setExtraChannels] = React.useState<ExtraChannel[]>([]);
  const [disableFallback, setDisableFallback] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setKind(initialTab);
  }, [open, initialTab]);

  const reset = React.useCallback(() => {
    setDirectRecipient(null);
    setGroupSubject('');
    setGroupRecipients([]);
    setBroadcastSubject('');
    setAudience(null);
    setAllowReplies(false);
    setBody('');
    setAttachments([]);
    setExtraChannels([]);
    setDisableFallback(false);
  }, []);

  const close = React.useCallback(() => {
    onOpenChange(false);
    window.setTimeout(reset, 150);
  }, [onOpenChange, reset]);

  const recipientCount = React.useMemo(() => {
    if (kind === 'direct') return directRecipient ? 1 : 0;
    if (kind === 'group') return groupRecipients.length;
    return 0;
  }, [kind, directRecipient, groupRecipients]);

  const canSubmit = React.useMemo(() => {
    if (isSubmitting) return false;
    if (body.trim().length === 0) return false;
    if (kind === 'direct') return directRecipient !== null;
    if (kind === 'group') {
      return (
        groupSubject.trim().length > 0 &&
        groupRecipients.length >= 2 &&
        groupRecipients.length <= 49
      );
    }
    if (kind === 'broadcast') {
      return (
        broadcastSubject.trim().length > 0 &&
        audience !== null &&
        (audience.mode !== 'custom' || audience.definition !== null)
      );
    }
    return false;
  }, [
    isSubmitting,
    body,
    kind,
    directRecipient,
    groupSubject,
    groupRecipients,
    broadcastSubject,
    audience,
  ]);

  const submit = React.useCallback(async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const payload = buildPayload({
        kind,
        body,
        attachments,
        extraChannels,
        disableFallback,
        directRecipient,
        groupSubject,
        groupRecipients,
        broadcastSubject,
        audience,
        allowReplies,
      });
      const response = await apiClient<
        { conversation_id?: string; id?: string } & Record<string, unknown>
      >('/api/v1/inbox/conversations', {
        method: 'POST',
        body: JSON.stringify(payload),
        silent: true,
      });
      const newId = response.conversation_id ?? response.id;
      toast.success(t('inbox.compose.toast.success'));
      close();
      if (typeof newId === 'string') {
        router.push(`/inbox/threads/${newId}`);
      }
    } catch (err) {
      const apiErr = err as {
        error?: { code?: string; message?: string };
        message?: string;
      };
      const code = apiErr.error?.code;
      if (code === 'BROADCAST_AUDIENCE_EMPTY') {
        toast.error(t('inbox.compose.toast.audienceEmpty'));
      } else {
        const message =
          apiErr.error?.message ?? apiErr.message ?? t('inbox.compose.toast.genericError');
        toast.error(message);
      }
      console.error('[compose-dialog.submit]', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    kind,
    body,
    attachments,
    extraChannels,
    disableFallback,
    directRecipient,
    groupSubject,
    groupRecipients,
    broadcastSubject,
    audience,
    allowReplies,
    router,
    close,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 p-0 md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-xl">
        <DialogHeader className="border-b border-border px-4 py-3 md:px-6">
          <DialogTitle>{t('inbox.compose.title')}</DialogTitle>
          <DialogDescription className="text-xs text-text-tertiary">
            {t('inbox.compose.description')}
          </DialogDescription>
        </DialogHeader>

        <nav
          role="tablist"
          aria-label={t('inbox.compose.tabs.label')}
          className="flex items-center gap-1 border-b border-border px-4 py-2 md:px-6"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = kind === tab.kind;
            return (
              <button
                key={tab.kind}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKind(tab.kind)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:bg-background/60',
                )}
              >
                <Icon className="h-4 w-4" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-6">
          {kind === 'direct' && (
            <div className="space-y-1.5">
              <Label>{t('inbox.compose.direct.recipient')}</Label>
              <PeoplePicker
                mode="single"
                value={directRecipient}
                onChange={setDirectRecipient}
                placeholder={t('inbox.compose.direct.recipientPlaceholder')}
                disabled={isSubmitting}
              />
            </div>
          )}

          {kind === 'group' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="group-subject">{t('inbox.compose.group.subject')}</Label>
                <Input
                  id="group-subject"
                  value={groupSubject}
                  onChange={(e) => setGroupSubject(e.target.value)}
                  placeholder={t('inbox.compose.group.subjectPlaceholder')}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('inbox.compose.group.participants')}</Label>
                <PeoplePicker
                  mode="multi"
                  value={groupRecipients}
                  onChange={setGroupRecipients}
                  maxRecipients={49}
                  placeholder={t('inbox.compose.group.participantsPlaceholder')}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-text-tertiary">
                  {t('inbox.compose.group.participantsCount', { count: groupRecipients.length })}
                </p>
              </div>
            </>
          )}

          {kind === 'broadcast' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="broadcast-subject">{t('inbox.compose.broadcast.subject')}</Label>
                <Input
                  id="broadcast-subject"
                  value={broadcastSubject}
                  onChange={(e) => setBroadcastSubject(e.target.value)}
                  placeholder={t('inbox.compose.broadcast.subjectPlaceholder')}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('inbox.compose.broadcast.audience')}</Label>
                <AudiencePicker value={audience} onChange={setAudience} disabled={isSubmitting} />
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3">
                <Checkbox
                  id="allow-replies"
                  checked={allowReplies}
                  onCheckedChange={(checked) => setAllowReplies(checked === true)}
                  disabled={isSubmitting}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="allow-replies" className="text-sm font-medium">
                    {t('inbox.compose.broadcast.allowReplies')}
                  </Label>
                  <p className="text-xs text-text-tertiary">
                    {t('inbox.compose.broadcast.allowRepliesHint')}
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="body">{t('inbox.compose.body.label')}</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('inbox.compose.body.placeholder')}
              rows={6}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('inbox.compose.attachments')}</Label>
            <AttachmentUploader
              value={attachments}
              onChange={setAttachments}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('inbox.compose.channels')}</Label>
            <ChannelSelector
              selected={extraChannels}
              onChange={setExtraChannels}
              recipientCount={recipientCount}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="disable-fallback"
              checked={disableFallback}
              onCheckedChange={(checked) => setDisableFallback(checked === true)}
              disabled={isSubmitting}
            />
            <div className="space-y-0.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="disable-fallback" className="text-sm font-medium">
                      {t('inbox.compose.disableFallback.label')}
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">{t('inbox.compose.disableFallback.hint')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border px-4 py-3 md:px-6">
          <Button type="button" variant="ghost" onClick={close} disabled={isSubmitting}>
            {t('inbox.compose.actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {isSubmitting ? (
              <Loader2 className="me-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="me-1 h-4 w-4" />
            )}
            {t('inbox.compose.actions.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Payload builder ──────────────────────────────────────────────────────────

interface BuildInput {
  kind: ConversationKind;
  body: string;
  attachments: AttachmentInput[];
  extraChannels: ExtraChannel[];
  disableFallback: boolean;
  directRecipient: PickedUser | null;
  groupSubject: string;
  groupRecipients: PickedUser[];
  broadcastSubject: string;
  audience: AudiencePickerValue | null;
  allowReplies: boolean;
}

export function buildPayload(input: BuildInput): Record<string, unknown> {
  const common = {
    body: input.body.trim(),
    attachments: input.attachments,
    extra_channels: input.extraChannels,
    disable_fallback: input.disableFallback,
  };
  if (input.kind === 'direct') {
    return {
      ...common,
      kind: 'direct' as const,
      recipient_user_id: input.directRecipient?.user_id,
    };
  }
  if (input.kind === 'group') {
    return {
      ...common,
      kind: 'group' as const,
      subject: input.groupSubject.trim(),
      participant_user_ids: input.groupRecipients.map((u) => u.user_id),
    };
  }
  const audienceBody: Record<string, unknown> = {};
  if (input.audience?.mode === 'saved') {
    audienceBody.saved_audience_id = input.audience.savedAudienceId;
    audienceBody.audience = input.audience.definition;
  } else if (input.audience && input.audience.definition) {
    audienceBody.audience = input.audience.definition;
  }
  return {
    ...common,
    kind: 'broadcast' as const,
    subject: input.broadcastSubject.trim(),
    allow_replies: input.allowReplies,
    ...audienceBody,
  };
}
