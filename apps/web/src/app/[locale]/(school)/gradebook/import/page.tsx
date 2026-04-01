'use client';

import { ArrowLeft, CheckCircle, Download, Upload } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidationRow {
  row_number: number;
  student_name: string;
  status: 'matched' | 'unmatched' | 'error';
  student_id: string | null;
  score: number | null;
  error_message: string | null;
}

interface ValidationResult {
  total: number;
  matched: number;
  unmatched: number;
  errors: number;
  rows: ValidationRow[];
}

type Step = 1 | 2 | 3 | 4;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradebookImportPage() {
  const t = useTranslations('import');
  const tg = useTranslations('gradebook');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [step, setStep] = React.useState<Step>(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  // Template filters
  const [classes, setClasses] = React.useState<{ id: string; name: string }[]>([]);
  const [periods, setPeriods] = React.useState<{ id: string; name: string }[]>([]);
  const [templateClassId, setTemplateClassId] = React.useState('all');
  const [templatePeriodId, setTemplatePeriodId] = React.useState('all');

  React.useEffect(() => {
    apiClient<{ data: { id: string; name: string }[] }>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data))
      .catch(() => undefined);
    apiClient<{ data: { id: string; name: string }[] }>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
  }, []);

  const templateUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    if (templateClassId !== 'all') params.set('class_id', templateClassId);
    if (templatePeriodId !== 'all') params.set('academic_period_id', templatePeriodId);
    const qs = params.toString();
    return `/api/v1/gradebook/import/template${qs ? `?${qs}` : ''}`;
  }, [templateClassId, templatePeriodId]);

  const steps: { key: Step; label: string }[] = [
    { key: 1, label: t('step1') },
    { key: 2, label: t('step2') },
    { key: 3, label: t('step3') },
    { key: 4, label: t('step4') },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
    }
  };

  const handleValidate = async () => {
    if (!file) return;
    setIsValidating(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/gradebook/import/validate`,
        {
          method: 'POST',
          body: formData,
          credentials: 'include',
        },
      );
      if (!res.ok) throw new Error('Validation failed');
      const data = (await res.json()) as { data: ValidationResult };
      setValidation(data.data);
      setStep(2);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsValidating(false);
    }
  };

  const handleProcess = async () => {
    if (!file || !validation) return;
    setIsProcessing(true);
    try {
      const matchedRows = validation.rows.filter((r) => r.status === 'matched');
      await apiClient('/api/v1/gradebook/import/process', {
        method: 'POST',
        body: JSON.stringify({
          rows: matchedRows.map((r) => ({
            student_id: r.student_id,
            score: r.score,
          })),
        }),
      });
      setStep(4);
      toast.success('Import completed');
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL || ''}${templateUrl}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/gradebook`)}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <PageHeader title={t('title')} />
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, idx) => (
          <React.Fragment key={s.key}>
            {idx > 0 && <div className="h-px flex-1 bg-border" />}
            <div
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${
                step === s.key
                  ? 'bg-primary-50 text-primary-700'
                  : step > s.key
                    ? 'bg-success-fill text-success-text'
                    : 'bg-surface-secondary text-text-tertiary'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-current/10 text-xs">
                {step > s.key ? <CheckCircle className="h-4 w-4" /> : s.key}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Template filters */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={templateClassId} onValueChange={setTemplateClassId}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={templatePeriodId} onValueChange={setTemplatePeriodId}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={tg('period')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
            <Upload className="mx-auto h-10 w-10 text-text-tertiary" />
            <p className="mt-3 text-sm text-text-secondary">{t('uploadCsv')}</p>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileChange}
              className="mt-3 text-sm"
            />
            {file && <p className="mt-2 text-sm text-text-primary">{file.name}</p>}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="me-2 h-4 w-4" />
              {t('downloadTemplate')}
            </Button>
            <Button onClick={handleValidate} disabled={!file || isValidating}>
              {isValidating ? tc('loading') : tc('next')}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && validation && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="rounded-xl border border-border bg-surface p-4 text-center">
              <p className="text-2xl font-semibold text-success-text">{validation.matched}</p>
              <p className="text-xs text-text-secondary">{t('matched')}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 text-center">
              <p className="text-2xl font-semibold text-warning-text">{validation.unmatched}</p>
              <p className="text-xs text-text-secondary">{t('unmatched')}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 text-center">
              <p className="text-2xl font-semibold text-danger-text">{validation.errors}</p>
              <p className="text-xs text-text-secondary">{t('errors')}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                    Row
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                    Student
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                    Status
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {validation.rows.map((row) => (
                  <tr key={row.row_number} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-sm font-mono text-text-secondary" dir="ltr">
                      {row.row_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">{row.student_name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={
                          row.status === 'matched'
                            ? 'success'
                            : row.status === 'unmatched'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {t(row.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {row.error_message ?? (row.score != null ? `Score: ${row.score}` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              {tc('back')}
            </Button>
            <Button onClick={() => setStep(3)} disabled={validation.matched === 0}>
              {tc('next')}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && validation && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {validation.matched} rows will be imported. Review and confirm.
          </p>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                    Student
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {validation.rows
                  .filter((r) => r.status === 'matched')
                  .map((row) => (
                    <tr key={row.row_number} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3 text-sm text-text-primary">{row.student_name}</td>
                      <td className="px-4 py-3 text-sm font-mono text-text-secondary" dir="ltr">
                        {row.score}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)}>
              {tc('back')}
            </Button>
            <Button onClick={handleProcess} disabled={isProcessing}>
              {isProcessing ? t('processing') : t('process')}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center py-12 text-center">
          <CheckCircle className="h-12 w-12 text-success-text" />
          <h3 className="mt-4 text-lg font-semibold text-text-primary">Import Complete</h3>
          <p className="mt-1 text-sm text-text-secondary">
            {validation?.matched ?? 0} grades were successfully imported.
          </p>
          <Button className="mt-6" onClick={() => router.push(`/${locale}/gradebook`)}>
            {tc('back')} to {tg('title')}
          </Button>
        </div>
      )}
    </div>
  );
}
