'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface ImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BulkImportDialog({ open, onOpenChange, onSuccess }: BulkImportDialogProps) {
  const t = useTranslations('payroll');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file) return;
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiClient<{ data: ImportResult }>('/api/v1/payroll/compensation/import', {
        method: 'POST',
        body: formData,
        headers: {},
      });
      setResult(res.data);
      if (res.data.errors.length === 0) {
        onSuccess();
      }
    } catch (err) {
      // handled by apiClient
      console.error('[onSuccess]', err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFile(null);
      setResult(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('bulkImport')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>CSV File</Label>
            <Input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} />
          </div>

          {result && (
            <div className="space-y-2">
              <p className="text-sm text-text-primary">
                Imported: <span className="font-semibold">{result.imported}</span>
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-danger-border bg-danger-50 p-3">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-danger-text">
                      Row {err.row}: {err.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleImport} disabled={!file || isImporting}>
            {isImporting ? '...' : t('bulkImport')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
