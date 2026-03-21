'use client';

import { Button } from '@school/ui';
import { Download, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


// ─── Types ────────────────────────────────────────────────────────────────────

interface PdfPreviewModalProps {
  url: string | null;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PdfPreviewModal({ url, onClose }: PdfPreviewModalProps) {
  const t = useTranslations('reportCards');

  if (!url) return null;

  const handleDownload = () => {
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-medium text-white">{t('preview')}</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="text-white hover:bg-white/10"
          >
            <Download className="me-1 h-4 w-4" />
            {t('download')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF iframe */}
      <div className="flex-1 p-4">
        <iframe
          src={url}
          className="h-full w-full rounded-lg bg-white"
          title={t('preview')}
        />
      </div>
    </div>
  );
}
