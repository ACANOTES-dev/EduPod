'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@school/ui';

interface ExplainButtonProps {
  contextId: string;
  contextKind: 'alert' | 'correlation' | 'deploy' | 'error' | 'health' | 'queue' | 'tenant';
  label?: string;
  locale: string;
  question?: string;
}

export function ExplainButton({
  contextId,
  contextKind,
  label = 'Explain',
  locale,
  question,
}: ExplainButtonProps) {
  const href = React.useMemo(() => {
    const params = new URLSearchParams({
      context_id: contextId,
      context_kind: contextKind,
      question: question ?? defaultQuestion(contextKind),
    });
    return `/${locale}/admin/copilot?${params.toString()}`;
  }, [contextId, contextKind, locale, question]);

  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>
        <Sparkles className="me-1.5 h-3.5 w-3.5" />
        {label}
      </Link>
    </Button>
  );
}

function defaultQuestion(contextKind: ExplainButtonProps['contextKind']): string {
  return `Explain this ${contextKind} using only cited platform evidence.`;
}
