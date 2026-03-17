import * as React from 'react';

import { cn } from '../lib/utils';

import { Badge, type BadgeProps } from './badge';

type SemanticVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: SemanticVariant;
  dot?: boolean;
}

const variantMap: Record<SemanticVariant, BadgeProps['variant']> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  neutral: 'secondary',
};

const dotColorMap: Record<SemanticVariant, string> = {
  success: 'bg-success-text',
  warning: 'bg-warning-text',
  danger: 'bg-danger-text',
  info: 'bg-info-text',
  neutral: 'bg-text-tertiary',
};

export function StatusBadge({ status, dot = false, className, children, ...props }: StatusBadgeProps) {
  return (
    <Badge variant={variantMap[status]} className={cn('transition-all duration-200', className)} {...props}>
      {dot && <span className={cn('me-1.5 inline-block h-1.5 w-1.5 rounded-full', dotColorMap[status])} />}
      {children}
    </Badge>
  );
}
