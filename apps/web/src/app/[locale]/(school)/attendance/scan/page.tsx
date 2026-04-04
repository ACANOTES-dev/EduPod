'use client';

import { AlertTriangle, ArrowLeft, Camera, CheckCircle, Loader2, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient, getAccessToken } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'upload' | 'processing' | 'confirm' | 'done';

type EntryStatus = 'absent_unexcused' | 'absent_excused' | 'late' | 'left_early';

interface ScanResultEntry {
  student_number: string;
  status: EntryStatus;
  reason?: string;
  confidence: 'high' | 'low';
  resolved_student_name?: string;
  resolved_student_id?: string;
  error?: string;
}

interface EditableEntry extends ScanResultEntry {
  /** Client-side key for React list rendering */
  _key: string;
}

interface ConfirmResult {
  success: boolean;
  updated: number;
  errors: Array<{ row: number; error: string }>;
  batch_id: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `entry-${keyCounter}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendanceScanPage() {
  const t = useTranslations('attendance');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [step, setStep] = React.useState<Step>('upload');
  const [sessionDate, setSessionDate] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<EditableEntry[]>([]);
  const [confirmResult, setConfirmResult] = React.useState<ConfirmResult | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ─── File Handling ──────────────────────────────────────────────────────

  const handleFile = React.useCallback((f: File | null) => {
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }

    if (!ACCEPTED_TYPES.includes(f.type)) {
      toast.error('Please select a JPEG, PNG, or WebP image');
      return;
    }

    if (f.size > MAX_FILE_SIZE) {
      toast.error('Image size must not exceed 10MB');
      return;
    }

    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    handleFile(selected);
  };

  // ─── Drag & Drop ───────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0] ?? null;
    handleFile(dropped);
  };

  // ─── Scan Handler ──────────────────────────────────────────────────────

  const handleScan = async () => {
    if (!file) {
      toast.error(t('scan.errorNoFile'));
      return;
    }
    if (!sessionDate) {
      toast.error(t('scan.errorNoDate'));
      return;
    }

    setStep('processing');

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('session_date', sessionDate);

      const token = getAccessToken();
      const res = await fetch('/api/v1/attendance/scan', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        const message = json?.error?.message ?? `Scan failed (${res.status})`;
        throw new Error(message);
      }

      const data = json.data as { scan_id: string; entries: ScanResultEntry[] };
      const editableEntries: EditableEntry[] = data.entries.map((entry) => ({
        ...entry,
        _key: nextKey(),
      }));

      setEntries(editableEntries);
      setStep('confirm');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      toast.error(message);
      setStep('upload');
    }
  };

  // ─── Entry Editing ─────────────────────────────────────────────────────

  const updateEntry = (key: string, field: keyof EditableEntry, value: string) => {
    setEntries((prev) => prev.map((e) => (e._key === key ? { ...e, [field]: value } : e)));
  };

  const removeEntry = (key: string) => {
    setEntries((prev) => prev.filter((e) => e._key !== key));
  };

  const addEntry = () => {
    const newEntry: EditableEntry = {
      _key: nextKey(),
      student_number: '',
      status: 'absent_unexcused',
      confidence: 'high',
    };
    setEntries((prev) => [...prev, newEntry]);
  };

  // ─── Confirm Handler ──────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!sessionDate) return;

    // Filter out entries with empty student number
    const validEntries = entries.filter((e) => e.student_number.trim().length > 0);

    if (validEntries.length === 0) {
      toast.error('No valid entries to submit');
      return;
    }

    setStep('processing');

    try {
      const response = await apiClient<{ data: ConfirmResult }>('/api/v1/attendance/scan/confirm', {
        method: 'POST',
        body: JSON.stringify({
          session_date: sessionDate,
          entries: validEntries.map((e) => ({
            student_number: e.student_number,
            status: e.status,
            reason: e.reason || undefined,
          })),
        }),
        silent: true,
      });

      setConfirmResult(response.data);
      setStep('done');
    } catch (err: unknown) {
      const errObj = err as { error?: { message?: string } };
      const message = errObj?.error?.message ?? 'Failed to apply attendance';
      toast.error(message);
      setStep('confirm');
    }
  };

  // ─── Reset ─────────────────────────────────────────────────────────────

  const resetToUpload = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setEntries([]);
    setConfirmResult(null);
    setSessionDate('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ─── Cleanup preview URL ──────────────────────────────────────────────

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // ─── Status label helper ──────────────────────────────────────────────

  const statusLabel = (status: EntryStatus): string => {
    switch (status) {
      case 'absent_unexcused':
        return t('absentUnexcused');
      case 'absent_excused':
        return t('absentExcused');
      case 'late':
        return t('late');
      case 'left_early':
        return t('leftEarly');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('scan.title')}
        description={t('scan.description')}
        actions={
          <Link href={`/${locale}/attendance/upload`}>
            <Button variant="outline">
              <ArrowLeft className="me-2 h-4 w-4" />
              {t('backToAttendance')}
            </Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* ─── Step 1: Upload ─────────────────────────────────────────── */}
        {step === 'upload' && (
          <>
            {/* Date Picker */}
            <div className="rounded-lg border border-border bg-surface p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-surface text-sm font-semibold text-primary-text">
                  1
                </span>
                <div className="flex-1 space-y-3">
                  <Label htmlFor="scan-date" className="text-base font-medium">
                    {t('scan.sessionDate')}
                  </Label>
                  <Input
                    id="scan-date"
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
              </div>
            </div>

            {/* Photo Upload */}
            <div className="rounded-lg border border-border bg-surface p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-surface text-sm font-semibold text-primary-text">
                  2
                </span>
                <div className="flex-1 space-y-3">
                  <Label className="text-base font-medium">{t('scan.dropzone')}</Label>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {/* Dropzone */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      isDragging
                        ? 'border-primary-500 bg-primary-50/50'
                        : file
                          ? 'border-success-border bg-success-surface/30'
                          : 'border-border hover:border-primary-400'
                    }`}
                  >
                    {preview ? (
                      <div className="space-y-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={preview}
                          alt={t('selectedPhoto')}
                          className="mx-auto max-h-48 rounded-lg object-contain"
                        />
                        <p className="text-sm text-text-secondary">{file?.name}</p>
                        <p className="text-xs text-text-tertiary">{t('scan.dropzone')}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Camera className="mx-auto h-12 w-12 text-text-tertiary" />
                        <p className="text-sm text-text-secondary">{t('scan.dropzone')}</p>
                        <p className="text-xs text-text-tertiary">{t('scan.dropzoneHint')}</p>
                      </div>
                    )}
                  </button>

                  {/* Scan Button */}
                  <div>
                    <Button onClick={handleScan} disabled={!file || !sessionDate}>
                      <Camera className="me-2 h-4 w-4" />
                      {t('scan.scanButton')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ─── Step 2: Processing ─────────────────────────────────────── */}
        {step === 'processing' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            <p className="text-lg font-medium text-text-primary">{t('scan.processing')}</p>
            <p className="text-sm text-text-secondary">{t('scan.processingDescription')}</p>
          </div>
        )}

        {/* ─── Step 3: Confirm ────────────────────────────────────────── */}
        {step === 'confirm' && (
          <>
            <div className="rounded-lg border border-border bg-surface p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    {t('scan.resultsTitle')}
                  </h3>
                  <p className="text-sm text-text-secondary">{t('scan.resultsDescription')}</p>
                </div>

                {/* Scrollable table for mobile */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-start">
                        <th className="py-2 pe-2 text-start font-medium text-text-secondary">
                          {t('scan.studentNumber')}
                        </th>
                        <th className="py-2 pe-2 text-start font-medium text-text-secondary">
                          {t('scan.studentName')}
                        </th>
                        <th className="py-2 pe-2 text-start font-medium text-text-secondary">
                          {t('scan.status')}
                        </th>
                        <th className="py-2 pe-2 text-start font-medium text-text-secondary">
                          {t('scan.reason')}
                        </th>
                        <th className="py-2 pe-2 text-start font-medium text-text-secondary">
                          {t('scan.confidence')}
                        </th>
                        <th className="py-2 text-start font-medium text-text-secondary">
                          {/* Actions column */}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => {
                        const isUnresolved =
                          !entry.resolved_student_id && entry.student_number.trim().length > 0;
                        const isLowConfidence = entry.confidence === 'low';

                        return (
                          <tr
                            key={entry._key}
                            className={`border-b border-border/50 ${
                              isLowConfidence ? 'bg-warning-fill/20' : ''
                            }`}
                          >
                            {/* Student Number */}
                            <td className="py-2 pe-2">
                              <Input
                                dir="ltr"
                                value={entry.student_number}
                                onChange={(e) =>
                                  updateEntry(entry._key, 'student_number', e.target.value)
                                }
                                className={`max-w-[120px] font-mono text-sm ${
                                  isUnresolved ? 'border-danger-border' : ''
                                }`}
                              />
                            </td>

                            {/* Student Name */}
                            <td className="py-2 pe-2">
                              {entry.resolved_student_name ? (
                                <span className="text-text-primary">
                                  {entry.resolved_student_name}
                                </span>
                              ) : entry.student_number.trim().length > 0 ? (
                                <span className="text-danger-text">{t('scan.notFound')}</span>
                              ) : (
                                <span className="text-text-tertiary">&mdash;</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-2 pe-2">
                              <Select
                                value={entry.status}
                                onValueChange={(value) => updateEntry(entry._key, 'status', value)}
                              >
                                <SelectTrigger className="w-[160px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="absent_unexcused">
                                    {statusLabel('absent_unexcused')}
                                  </SelectItem>
                                  <SelectItem value="absent_excused">
                                    {statusLabel('absent_excused')}
                                  </SelectItem>
                                  <SelectItem value="late">{statusLabel('late')}</SelectItem>
                                  <SelectItem value="left_early">
                                    {statusLabel('left_early')}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </td>

                            {/* Reason */}
                            <td className="py-2 pe-2">
                              <Input
                                value={entry.reason ?? ''}
                                onChange={(e) => updateEntry(entry._key, 'reason', e.target.value)}
                                placeholder={t('scan.reason')}
                                className="max-w-[160px] text-sm"
                              />
                            </td>

                            {/* Confidence */}
                            <td className="py-2 pe-2">
                              <Badge variant={entry.confidence === 'high' ? 'success' : 'warning'}>
                                {entry.confidence === 'high'
                                  ? t('scan.confidenceHigh')
                                  : t('scan.confidenceLow')}
                              </Badge>
                            </td>

                            {/* Remove */}
                            <td className="py-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeEntry(entry._key)}
                                className="h-8 w-8 p-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Add Row */}
                <Button variant="outline" size="sm" onClick={addEntry}>
                  <Plus className="me-2 h-4 w-4" />
                  {t('scan.addRow')}
                </Button>

                {/* Unresolved warning */}
                {entries.some(
                  (e) => !e.resolved_student_id && e.student_number.trim().length > 0,
                ) && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-fill/20 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
                    <p className="text-sm text-warning-text">
                      {t('scan.notFound')} &mdash; {t('scan.resultsDescription')}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button onClick={handleConfirm} disabled={entries.length === 0}>
                    <CheckCircle className="me-2 h-4 w-4" />
                    {t('scan.confirmApply')}
                  </Button>
                  <Button variant="outline" onClick={resetToUpload}>
                    {t('scan.cancel')}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ─── Step 4: Done ───────────────────────────────────────────── */}
        {step === 'done' && confirmResult && (
          <div className="rounded-lg border border-success-border bg-success-surface p-8 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-success-text" />
            <h3 className="mt-4 text-lg font-semibold text-success-text">{t('scan.success')}</h3>
            <p className="mt-2 text-sm text-text-secondary">
              {t('scan.successDescription', { count: confirmResult.updated })}
            </p>
            {confirmResult.errors.length > 0 && (
              <div className="mx-auto mt-4 max-w-md text-start">
                <p className="text-sm font-medium text-danger-text">
                  {t('errorsFound', { count: confirmResult.errors.length })}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-text-secondary">
                  {confirmResult.errors.map((err, idx) => (
                    <li key={idx}>
                      {t('errorRow')} {err.row}: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={resetToUpload}>{t('scan.scanAnother')}</Button>
              <Link href={`/${locale}/attendance`}>
                <Button variant="outline">{t('backToAttendance')}</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
