'use client';

import { Button, Input, Label, Textarea, toast } from '@school/ui';
import { ArrowLeft, Download, Upload, CheckCircle2, AlertTriangle, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient, getAccessToken } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadMode = 'standard' | 'exceptions';

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

interface ExceptionsUploadResult {
  success: boolean;
  updated: number;
  errors: Array<{ row: number; error: string }>;
  batch_id: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNDO_WINDOW_SECONDS = 300; // 5 minutes

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendanceUploadPage() {
  const t = useTranslations('attendance');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  // Shared state
  const [selectedDate, setSelectedDate] = React.useState('');
  const [mode, setMode] = React.useState<UploadMode>('standard');

  // Standard mode state
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [result, setResult] = React.useState<UploadResult | null>(null);

  // Exceptions mode state
  const [quickMarkText, setQuickMarkText] = React.useState('');
  const [isSubmittingQuickMark, setIsSubmittingQuickMark] = React.useState(false);
  const [exceptionsResult, setExceptionsResult] = React.useState<ExceptionsUploadResult | null>(null);

  // Undo state
  const [undoCountdown, setUndoCountdown] = React.useState(0);
  const [isUndoing, setIsUndoing] = React.useState(false);
  const undoTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ─── Undo Countdown ──────────────────────────────────────────────────────

  const startUndoCountdown = React.useCallback(() => {
    // Clear any existing timer
    if (undoTimerRef.current) {
      clearInterval(undoTimerRef.current);
    }
    setUndoCountdown(UNDO_WINDOW_SECONDS);
    undoTimerRef.current = setInterval(() => {
      setUndoCountdown((prev) => {
        if (prev <= 1) {
          if (undoTimerRef.current) {
            clearInterval(undoTimerRef.current);
            undoTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearInterval(undoTimerRef.current);
      }
    };
  }, []);

  // ─── Standard Mode Handlers ──────────────────────────────────────────────

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

  // ─── Exceptions Mode Handlers ─────────────────────────────────────────────

  const handleQuickMark = async () => {
    if (!selectedDate) {
      toast.error(t('selectDateFirst'));
      return;
    }
    if (!quickMarkText.trim()) return;

    setIsSubmittingQuickMark(true);
    setExceptionsResult(null);

    try {
      const response = await apiClient<{ data: ExceptionsUploadResult }>(
        '/api/v1/attendance/quick-mark',
        {
          method: 'POST',
          body: JSON.stringify({
            session_date: selectedDate,
            text: quickMarkText.trim(),
          }),
          silent: true,
        },
      );

      const data = response.data;
      setExceptionsResult(data);

      if (data.updated > 0) {
        toast.success(t('quickMarkSuccess', { count: data.updated }));
        startUndoCountdown();
      }

      if (data.errors.length > 0) {
        toast.error(t('errorsFound', { count: data.errors.length }));
      }
    } catch (err: unknown) {
      const errObj = err as { error?: { message?: string } };
      const message = errObj?.error?.message ?? 'Quick mark failed';
      toast.error(message);
    } finally {
      setIsSubmittingQuickMark(false);
    }
  };

  // ─── Undo Handler ────────────────────────────────────────────────────────

  const handleUndo = async () => {
    if (!exceptionsResult?.batch_id) return;

    setIsUndoing(true);
    try {
      const response = await apiClient<{ data: { reverted: number } }>(
        '/api/v1/attendance/upload/undo',
        {
          method: 'POST',
          body: JSON.stringify({ batch_id: exceptionsResult.batch_id }),
          silent: true,
        },
      );

      toast.success(t('undoSuccess'));

      // Clear undo state
      if (undoTimerRef.current) {
        clearInterval(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      setUndoCountdown(0);
      setExceptionsResult(null);
      setQuickMarkText('');

      // Use the response to avoid lint warning
      void response;
    } catch (err: unknown) {
      const errObj = err as { error?: { message?: string } };
      const message = errObj?.error?.message ?? t('undoExpired');
      toast.error(message);
    } finally {
      setIsUndoing(false);
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const hasDate = selectedDate.length > 0;

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // ─── Render ──────────────────────────────────────────────────────────────

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
        {/* Mode Toggle */}
        <div className="flex gap-2 rounded-lg border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => {
              setMode('standard');
              setExceptionsResult(null);
            }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'standard'
                ? 'bg-primary-surface text-primary-text'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('modeStandard')}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('exceptions');
              setResult(null);
            }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'exceptions'
                ? 'bg-primary-surface text-primary-text'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('modeExceptions')}
          </button>
        </div>

        {/* Step 1: Select Date (shared between modes) */}
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
                  setExceptionsResult(null);
                }}
                className="max-w-xs"
              />
            </div>
          </div>
        </div>

        {/* ─── Standard Mode ─────────────────────────────────────────── */}
        {mode === 'standard' && (
          <>
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

            {/* Standard Results Area */}
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
          </>
        )}

        {/* ─── Exceptions Mode ───────────────────────────────────────── */}
        {mode === 'exceptions' && (
          <>
            {/* Step 2: Quick Mark */}
            <div className="rounded-lg border border-border bg-surface p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-surface text-sm font-semibold text-primary-text">
                  2
                </span>
                <div className="flex-1 space-y-3">
                  <Label className="text-base font-medium">
                    {t('quickMark')}
                  </Label>
                  <p className="text-sm text-text-secondary">
                    {t('quickMarkDescription')}
                  </p>
                  <Textarea
                    placeholder={"1045 A\n1032 L\n1078 AE sick"}
                    value={quickMarkText}
                    onChange={(e) => setQuickMarkText(e.target.value)}
                    rows={8}
                    dir="ltr"
                    className="font-mono"
                  />
                  <div>
                    <Button
                      onClick={handleQuickMark}
                      disabled={!quickMarkText.trim() || !hasDate || isSubmittingQuickMark}
                    >
                      <Upload className="me-2 h-4 w-4" />
                      {isSubmittingQuickMark ? t('submittingQuickMark') : t('submitQuickMark')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Help */}
            <p className="text-center text-xs text-text-tertiary">
              {t('statusHelp')}
            </p>

            {/* Undo Banner */}
            {exceptionsResult && exceptionsResult.batch_id && exceptionsResult.updated > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium text-text-primary">
                      {t('quickMarkSuccess', { count: exceptionsResult.updated })}
                    </p>
                    {exceptionsResult.errors.length > 0 && (
                      <p className="text-sm text-danger-text">
                        {t('errorsFound', { count: exceptionsResult.errors.length })}
                      </p>
                    )}
                  </div>
                  {undoCountdown > 0 && (
                    <Button
                      variant="outline"
                      onClick={handleUndo}
                      disabled={isUndoing}
                    >
                      <Undo2 className="me-2 h-4 w-4" />
                      {isUndoing
                        ? t('undoing')
                        : `${t('undo')} (${formatCountdown(undoCountdown)})`}
                    </Button>
                  )}
                  {undoCountdown === 0 && exceptionsResult.batch_id && (
                    <span className="text-sm text-text-tertiary">
                      {t('undoExpired')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Exceptions Errors */}
            {exceptionsResult && exceptionsResult.errors.length > 0 && (
              <div className="rounded-lg border border-danger-border bg-danger-surface p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
                  <div className="space-y-1">
                    <p className="font-semibold text-danger-text">
                      {t('errorsFound', { count: exceptionsResult.errors.length })}
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
                        <th className="py-2 text-start font-medium text-danger-text">
                          {t('errorMessage')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptionsResult.errors.map((err, idx) => (
                        <tr
                          key={`${err.row}-${idx}`}
                          className="border-b border-danger-border/50"
                        >
                          <td className="py-2 pe-4 font-mono text-text-primary">
                            {err.row}
                          </td>
                          <td className="py-2 text-text-secondary">
                            {err.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Success without errors — show back link */}
            {exceptionsResult && exceptionsResult.updated > 0 && exceptionsResult.errors.length === 0 && undoCountdown === 0 && (
              <div className="rounded-lg border border-success-border bg-success-surface p-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-text" />
                  <div className="space-y-1">
                    <p className="font-semibold text-success-text">
                      {t('quickMarkSuccess', { count: exceptionsResult.updated })}
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
          </>
        )}
      </div>
    </div>
  );
}
