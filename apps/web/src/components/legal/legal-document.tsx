'use client';

import * as React from 'react';

import { cn } from '@school/ui';

interface LegalDocumentProps {
  html: string;
  className?: string;
}

export function LegalDocument({ html, className }: LegalDocumentProps) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none rounded-3xl border border-border bg-surface p-6 text-text-primary shadow-sm prose-headings:text-text-primary prose-p:text-text-secondary prose-strong:text-text-primary prose-li:text-text-secondary',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
