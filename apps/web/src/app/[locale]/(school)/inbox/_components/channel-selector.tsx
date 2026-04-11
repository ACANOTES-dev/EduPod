'use client';

import { Check, Mail, Phone, Smartphone } from 'lucide-react';
import * as React from 'react';

import {
  INBOX_CHANNELS,
  INBOX_CHANNEL_COST_CURRENCY,
  INBOX_CHANNEL_ESTIMATED_COSTS,
  type InboxChannel,
} from '@school/shared/inbox';
import { cn } from '@school/ui';

/**
 * ChannelSelector — the compose dialog's channel toggle row.
 *
 * The inbox channel is locked on. Email / SMS / WhatsApp are opt-in,
 * additive channels. The cost estimate underneath is a UX nudge only
 * — per `channel-costs.ts` it is NOT invoiced.
 */

type ExtraChannel = Exclude<InboxChannel, 'inbox'>;
const EXTRA_CHANNELS: ExtraChannel[] = INBOX_CHANNELS.filter(
  (c): c is ExtraChannel => c !== 'inbox',
);

interface Props {
  selected: ExtraChannel[];
  onChange: (value: ExtraChannel[]) => void;
  recipientCount: number;
  disabled?: boolean;
}

const CHANNEL_ICONS: Record<InboxChannel, React.ElementType> = {
  inbox: Mail,
  email: Mail,
  sms: Smartphone,
  whatsapp: Phone,
};

const CHANNEL_LABELS: Record<InboxChannel, string> = {
  inbox: 'Inbox',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

export function ChannelSelector({ selected, onChange, recipientCount, disabled }: Props) {
  const toggle = (channel: ExtraChannel) => {
    if (disabled) return;
    if (selected.includes(channel)) {
      onChange(selected.filter((c) => c !== channel));
    } else {
      onChange([...selected, channel]);
    }
  };

  const estimatedCost = React.useMemo(() => {
    const perRecipient = selected.reduce(
      (sum, channel) => sum + (INBOX_CHANNEL_ESTIMATED_COSTS[channel] ?? 0),
      0,
    );
    return perRecipient * Math.max(0, recipientCount);
  }, [selected, recipientCount]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <ChannelChip
          active
          locked
          icon={CHANNEL_ICONS.inbox}
          label={CHANNEL_LABELS.inbox}
          sublabel="Always sent · free"
        />
        {EXTRA_CHANNELS.map((channel) => (
          <ChannelChip
            key={channel}
            active={selected.includes(channel)}
            onClick={() => toggle(channel)}
            icon={CHANNEL_ICONS[channel]}
            label={CHANNEL_LABELS[channel]}
            sublabel={`${INBOX_CHANNEL_COST_CURRENCY} ${INBOX_CHANNEL_ESTIMATED_COSTS[channel].toFixed(3)} / recipient`}
            disabled={disabled}
          />
        ))}
      </div>
      <p className="text-xs text-text-tertiary">
        {selected.length === 0 ? (
          <>Inbox only · no external channels</>
        ) : (
          <>
            Estimated cost:{' '}
            <strong className="text-text-secondary">
              {INBOX_CHANNEL_COST_CURRENCY} {estimatedCost.toFixed(2)}
            </strong>{' '}
            for {recipientCount} recipient{recipientCount === 1 ? '' : 's'} · UX estimate, not
            billing
          </>
        )}
      </p>
    </div>
  );
}

interface ChannelChipProps {
  active: boolean;
  locked?: boolean;
  disabled?: boolean;
  icon: React.ElementType;
  label: string;
  sublabel: string;
  onClick?: () => void;
}

function ChannelChip({
  active,
  locked,
  disabled,
  icon: Icon,
  label,
  sublabel,
  onClick,
}: ChannelChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked || disabled}
      aria-pressed={active}
      className={cn(
        'group flex min-w-[160px] items-center gap-3 rounded-lg border p-3 text-start transition',
        active ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-background/60',
        locked && 'cursor-not-allowed opacity-95',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md',
          active ? 'bg-primary/15 text-primary' : 'bg-background/40 text-text-tertiary',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 text-sm font-medium text-text-primary">
          {label}
          {active && <Check className="h-3.5 w-3.5 text-primary" />}
        </span>
        <span className="text-xs text-text-tertiary">{sublabel}</span>
      </span>
    </button>
  );
}
