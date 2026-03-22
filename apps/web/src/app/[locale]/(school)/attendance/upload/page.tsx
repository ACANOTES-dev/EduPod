'use client';

import { Button, Input, Label, toast } from '@school/ui';
import { ArrowLeft, Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { getAccessToken } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface UploadResultError {
  valid: false;
  errors: ValidationError[];
  total_rows: number;
  valid_rows: number;
}

interface UploadResultSuccess {
  valid: true;
  sessions_created: number;
  records_created: number;
}

type UploadResult = UploadResultError | UploadResultSuccess;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendanceUploadPage() {
  const t = useTranslations('attendance');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [selectedDate, setSelectedDate] = React.useState('');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [result, setResult] = React.useState<UploadResult | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    if (!selectedDate) {
      toast.error(t('selectDateFirst'));
      return;
    }

    setIsDownloading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(
        `/api/v1/attendance/upload-template?session_date=${selectedDate}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? `Download failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-template-${selectedDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Download failed';
      toast.error(message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!selectedDate) {
      toast.error(t('selectDateFirst'));
      return;
    }
    if (!selectedFile) {
      toast.error(t('noFileSelected'));
      return;
    }

    setIsUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('session_date', selectedDate);

      const token = getAccessToken();
      const res = await fetch('/api/v1/attendance/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        // Server returned an error envelope
        if (json?.data?.valid === false) {
          setResult(json.data as UploadResultError);
        } else {
          throw new Error(json?.error?.message ?? `Upload failed (${res.status})`);
        }
        return;
      }

      const data = json.data as UploadResult;
      setResult(data);

      if (data.valid) {
        toast.success(t('uploadSuccess'));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const hasDate = selectedDate.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('uploadTitle')}
        description={t('uploadDescription')}
        actions={
          <Link href={`/${locale}/attendance`}>
            <Button variant="outline">
              <ArrowLeft className="me-2 h-4 w-4" />
              {t('backToAttendance')}
            </Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Step 1: Select Date */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-surface text-sm font-semibold text-primary-text">
              1
            </span>
            <div className="flex-1 space-y-3">
              <Label htmlFor="session-date" className="text-base font-medium">
                {t('selectDate')}
              </Label>
              <Input
                id="session-date"
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setResult(null);
                }}
                className="max-w-xs"
              />
            </div>
          </div>
        </div>

        {/* Step 2: Download Template */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-surface text-sm font-semibold text-primary-text">
              2
            </span>
            <div className="flex-1 space-y-3">
              <Label className="text-base font-medium">
                {t('downloadTemplate')}
              </Label>
              <div>
                <Button
                  variant="outline"
                  onClick={handleDownloadTemplate}
                  disabled={!hasDate || isDownloading}
                >
                  <Download className="me-2 h-4 w-4" />
                  {isDownloading ? '...' : t('downloadTemplate')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Upload File */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-surface text-sm font-semibold text-primary-text">
              3
            </span>
            <div className="flex-1 space-y-3">
              <Label htmlFor="upload-file" className="text-base font-medium">
                {t('uploadFile')}
              </Label>
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  id="upload-file"
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileChange}
                  disabled={!hasDate}
                  className="block w-full text-sm text-text-secondary file:me-3 file:rounded-md file:border-0 file:bg-primary-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-text hover:file:cursor-pointer disabled:opacity-50"
                />
                <p className="text-xs text-text-tertiary">
                  {t('uploadAccept')}
                </p>
              </div>
              <div>
                <Button
                  onClick={handleUpload}
                  disabled={!hasDate || !selectedFile || isUploading}
                >
                  <Upload className="me-2 h-4 w-4" />
                  {isUploading ? t('uploading') : t('uploadFile')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Status Help */}
        <p className="text-center text-xs text-text-tertiary">
          {t('statusHelp')}
        </p>

        {/* Results Area */}
        {result && result.valid && (
          <div className="rounded-lg border border-success-border bg-success-surface p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-text" />
              <div className="space-y-1">
                <p className="font-semibold text-success-text">
                  {t('uploadSuccess')}
                </p>
                <p className="text-sm text-text-secondary">
                  {t('sessionsCreated', { count: result.sessions_created })}
                </p>
                <p className="text-sm text-text-secondary">
                  {t('recordsCreated', { count: result.records_created })}
                </p>
                <div className="pt-3">
                  <Link href={`/${locale}/attendance`}>
                    <Button variant="outline" size="sm">
                      {t('backToAttendance')}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {result && !result.valid && (
          <div className="rounded-lg border border-danger-border bg-danger-surface p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
              <div className="space-y-1">
                <p className="font-semibold text-danger-text">
                  {t('validationErrors')}
                </p>
                <p className="text-sm text-text-secondary">
                  {t('validRows', {
                    valid: result.valid_rows,
                    total: result.total_rows,
                  })}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-danger-border text-start">
                    <th className="py-2 pe-4 text-start font-medium text-danger-text">
                      {t('errorRow')}
                    </th>
                    <th className="py-2 pe-4 text-start font-medium text-danger-text">
                      {t('errorField')}
                    </th>
                    <th className="py-2 text-start font-medium text-danger-text">
                      {t('errorMessage')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((err, idx) => (
                    <tr
                      key={`${err.row}-${err.field}-${idx}`}
                      className="border-b border-danger-border/50"
                    >
                      <td className="py-2 pe-4 font-mono text-text-primary">
                        {err.row}
                      </td>
                      <td className="py-2 pe-4 text-text-primary">
                        {err.field}
                      </td>
                      <td className="py-2 text-text-secondary">
                        {err.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
