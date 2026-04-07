'use client';

import { Download, Loader2, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@school/ui';

import { getAccessToken } from '@/lib/api-client';

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  pdfUrl: string | null;
}

export function PdfPreviewModal({ open, onOpenChange, title, pdfUrl }: PdfPreviewModalProps) {
  const t = useTranslations('finance');
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !pdfUrl) {
      setBlobUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    const token = getAccessToken();

    fetch(`${apiUrl}${pdfUrl}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        // Ensure the blob has the correct MIME type for PDF viewing/download
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        setBlobUrl(url);
      })
      .catch((err) => {
        console.error('[PdfPreviewModal]', err);
        if (!cancelled) setError(t('pdfLoadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, pdfUrl, t]);

  // Clean up blob URL when modal closes
  React.useEffect(() => {
    if (!open && blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
  }, [open, blobUrl]);

  const handlePrint = () => {
    if (!blobUrl) return;
    const printWindow = window.open(blobUrl, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  };

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[90vw]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!blobUrl}>
            <Printer className="me-2 h-4 w-4" />
            {t('print')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={!blobUrl}>
            <Download className="me-2 h-4 w-4" />
            {t('download')}
          </Button>
        </div>

        {/* Content */}
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          {isLoading && (
            <div className="flex h-[60vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-text-tertiary" />
            </div>
          )}
          {error && (
            <div className="flex h-[60vh] items-center justify-center">
              <p className="text-sm text-danger-text">{error}</p>
            </div>
          )}
          {blobUrl && !isLoading && !error && (
            <iframe src={blobUrl} className="h-[60vh] w-full" title={title} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
