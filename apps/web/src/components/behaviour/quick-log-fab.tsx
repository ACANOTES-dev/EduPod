'use client';

import { Button } from '@school/ui';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

interface QuickLogFabProps {
  onClick: () => void;
}

export function QuickLogFab({ onClick }: QuickLogFabProps) {
  const t = useTranslations('behaviour.components.quickLog');
  return (
    <Button
      onClick={onClick}
      className="fixed bottom-6 end-6 z-40 h-14 w-14 rounded-full bg-emerald-600 shadow-lg hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
      aria-label={t('title')}
    >
      <Plus className="h-6 w-6 text-white" />
    </Button>
  );
}
