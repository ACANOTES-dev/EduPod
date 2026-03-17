'use client';

import Link from 'next/link';
import * as React from 'react';
import { HoverPreviewCard } from './hover-preview-card';

interface EntityLinkProps {
  entityType: string;
  entityId: string;
  label: string;
  href: string;
  className?: string;
}

export function EntityLink({ entityType, entityId, label, href, className }: EntityLinkProps) {
  return (
    <HoverPreviewCard entityType={entityType} entityId={entityId}>
      <Link
        href={href}
        className={
          className ??
          'text-primary-700 underline-offset-2 hover:underline focus:outline-none focus:underline'
        }
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </Link>
    </HoverPreviewCard>
  );
}
