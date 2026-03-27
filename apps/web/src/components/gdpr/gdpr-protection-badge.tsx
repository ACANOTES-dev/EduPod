'use client';

import { Info, Shield, ShieldCheck, ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@school/ui';

interface GdprProtectionBadgeProps {
  /** The tokenisation policy: 'always' | 'never' | 'configurable' */
  policy: 'always' | 'never' | 'configurable';
  /** The lawful basis for the data flow */
  lawfulBasis?: string;
  /** Whether tokenisation is currently ON (only relevant for 'configurable') */
  tokenisationEnabled?: boolean;
  /** Callback when admin toggles tokenisation (only for 'configurable') */
  onToggle?: (enabled: boolean, reason?: string) => void;
  /** Optional size variant */
  size?: 'sm' | 'md';
  /** Optional extra className */
  className?: string;
}

const BADGE_CLASSES = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  gray: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
};

export function GdprProtectionBadge({
  policy,
  lawfulBasis,
  tokenisationEnabled = true,
  onToggle,
  size = 'md',
  className,
}: GdprProtectionBadgeProps) {
  const t = useTranslations('gdpr.badge');
  const [showReasonDialog, setShowReasonDialog] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [reasonError, setReasonError] = React.useState(false);

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const badgePadding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  function handleSwitchChange(checked: boolean) {
    if (!checked) {
      // Turning OFF requires a reason
      setReason('');
      setReasonError(false);
      setShowReasonDialog(true);
    } else {
      // Turning ON — no reason needed
      onToggle?.(true);
    }
  }

  function handleReasonConfirm() {
    if (!reason.trim()) {
      setReasonError(true);
      return;
    }
    setShowReasonDialog(false);
    onToggle?.(false, reason.trim());
    setReason('');
    setReasonError(false);
  }

  function handleReasonCancel() {
    setShowReasonDialog(false);
    setReason('');
    setReasonError(false);
  }

  // --- State 1: Locked ON (policy='always') ---
  if (policy === 'always') {
    return (
      <>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn('inline-flex items-center gap-2', className)}>
                <Badge className={cn(BADGE_CLASSES.green, badgePadding, 'inline-flex items-center gap-1.5 border-0 font-medium', textSize)}>
                  <ShieldCheck className={iconSize} />
                  {t('protected')}
                </Badge>
                <Switch
                  checked={true}
                  disabled={true}
                  aria-label={t('protected')}
                  className="opacity-50 cursor-not-allowed"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {t('protectedTooltip')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </>
    );
  }

  // --- State 2: Locked OFF (policy='never') ---
  if (policy === 'never') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('inline-flex items-center gap-1.5', className)}>
              <Badge className={cn(BADGE_CLASSES.blue, badgePadding, 'inline-flex items-center gap-1.5 border-0 font-medium', textSize)}>
                <Info className={iconSize} />
                {t('personalExport')}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {t('personalExportTooltip', { basis: lawfulBasis ?? '' })}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // --- State 3: Configurable (policy='configurable') ---
  const isOn = tokenisationEnabled;
  const badgeClass = isOn ? BADGE_CLASSES.green : BADGE_CLASSES.amber;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('inline-flex items-center gap-2', className)}>
              <Badge
                className={cn(
                  badgeClass,
                  badgePadding,
                  'inline-flex items-center gap-1.5 border-0 font-medium',
                  textSize,
                )}
              >
                {isOn ? (
                  <ShieldCheck className={iconSize} />
                ) : (
                  <ShieldOff className={iconSize} />
                )}
                {isOn ? t('protected') : t('unprotected')}
              </Badge>
              <Switch
                checked={isOn}
                onCheckedChange={handleSwitchChange}
                aria-label={isOn ? t('protected') : t('unprotected')}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {isOn ? t('protectedTooltip') : t('unprotectedTooltip')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={showReasonDialog} onOpenChange={(open) => { if (!open) handleReasonCancel(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              {t('disableReasonTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <p className={cn('text-text-secondary', textSize)}>
              {t('disableReasonDescription')}
            </p>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setReasonError(false);
              }}
              placeholder={t('disableReasonPlaceholder')}
              rows={3}
              className={cn('w-full', reasonError && 'border-red-500 focus-visible:ring-red-500')}
              aria-required="true"
              aria-invalid={reasonError}
            />
            {reasonError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {t('disableReasonRequired')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleReasonCancel}>
              {t('cancel')}
            </Button>
            <Button variant="default" onClick={handleReasonConfirm}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
