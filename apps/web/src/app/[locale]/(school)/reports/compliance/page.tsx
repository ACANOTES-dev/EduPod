'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type {
  ComplianceFieldKey,
  ComplianceHistoryEntry,
  ComplianceReportResponse,
  GenerateComplianceReportDto,
} from '@school/shared/reports';
import { COMPLIANCE_FIELD_KEYS } from '@school/shared/reports';
import { toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ComplianceFieldChecklist } from './_components/compliance-field-checklist';
import { ComplianceGenerationControls } from './_components/compliance-generation-controls';
import { ComplianceHistory } from './_components/compliance-history';
import { CompliancePreviewPane } from './_components/compliance-preview-pane';

interface AcademicYear {
  id: string;
  name: string;
}

export default function ComplianceReportPage() {
  const t = useTranslations('reports');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [loadingYears, setLoadingYears] = React.useState(true);

  const [selectedYearId, setSelectedYearId] = React.useState('');
  const [selectedFields, setSelectedFields] = React.useState<Set<ComplianceFieldKey>>(
    () => new Set(COMPLIANCE_FIELD_KEYS),
  );

  const [generating, setGenerating] = React.useState(false);
  const [report, setReport] = React.useState<ComplianceReportResponse | null>(null);

  const [history, setHistory] = React.useState<ComplianceHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);

  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=100')
      .then((res) => {
        setAcademicYears(res.data);
        if (res.data.length > 0 && res.data[0]) {
          setSelectedYearId(res.data[0].id);
        }
      })
      .catch((err) => {
        console.error('[ComplianceReportPage] Failed to load academic years', err);
      })
      .finally(() => setLoadingYears(false));
  }, []);

  const refreshHistory = React.useCallback(() => {
    setLoadingHistory(true);
    apiClient<{ data: ComplianceHistoryEntry[] }>('/api/v1/reports/compliance/history')
      .then((res) => setHistory(res.data))
      .catch((err) => {
        console.error('[ComplianceReportPage] Failed to load history', err);
      })
      .finally(() => setLoadingHistory(false));
  }, []);

  React.useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const toggleField = (field: ComplianceFieldKey) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const toggleAllFields = (checked: boolean) => {
    setSelectedFields(checked ? new Set(COMPLIANCE_FIELD_KEYS) : new Set());
  };

  const handleGenerate = async () => {
    if (!selectedYearId) return;

    const fieldsArray = Array.from(selectedFields);
    if (fieldsArray.length === 0) return;

    // The shared schema requires a non-empty `fields` tuple. Cast to a
    // [head, ...rest] tuple after the empty check to satisfy Zod's
    // `.nonempty()` constraint without weakening the type.
    const [firstField, ...restFields] = fieldsArray;
    if (!firstField) return;

    setGenerating(true);
    try {
      const req: GenerateComplianceReportDto = {
        academic_year_id: selectedYearId,
        fields: [firstField, ...restFields],
      };

      const res = await apiClient<ComplianceReportResponse>('/api/v1/reports/compliance/generate', {
        method: 'POST',
        body: JSON.stringify(req),
      });

      setReport(res);
      refreshHistory();
      toast.success(t('compliance.generateSuccess'));
    } catch (err) {
      const apiErr = err as { code?: string; message?: string };
      console.error('[ComplianceReportPage] Generate failed:', err);
      toast.error(apiErr?.message ?? t('compliance.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadHistory = React.useCallback(
    (historyEntry: ComplianceHistoryEntry) => {
      // The compliance API doesn't expose a "fetch full report by id"
      // endpoint yet — re-generation is the path forward. Surface this
      // so the user understands. Tracked as a follow-up in impl 20's
      // completion record.
      toast.message(
        t('compliance.history.reloadComingSoon', {
          date: new Date(historyEntry.generated_at).toLocaleDateString(),
        }),
      );
    },
    [t],
  );

  return (
    <div className="space-y-8 print:space-y-4" data-testid="compliance-report-page">
      <div className="print:hidden">
        <PageHeader
          title={t('compliance.reportTitle')}
          description={t('compliance.reportDescription')}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* Left sidebar - Field checklist */}
        <div className="lg:col-span-1">
          <ComplianceFieldChecklist
            selectedFields={selectedFields}
            onToggleField={toggleField}
            onToggleAllFields={toggleAllFields}
          />
        </div>

        {/* Center - Generation controls + Preview */}
        <div className="space-y-8 lg:col-span-3 print:col-span-4">
          <ComplianceGenerationControls
            academicYears={academicYears}
            selectedYearId={selectedYearId}
            onYearChange={setSelectedYearId}
            generating={generating}
            onGenerate={handleGenerate}
            loadingYears={loadingYears}
            selectedFieldCount={selectedFields.size}
          />

          {report && <CompliancePreviewPane report={report} />}

          {!report && !generating && (
            <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center print:hidden">
              <p className="text-sm text-text-tertiary">{t('compliance.noReportGenerated')}</p>
            </div>
          )}

          {generating && (
            <div className="space-y-3 print:hidden">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <ComplianceHistory history={history} loading={loadingHistory} onLoad={handleLoadHistory} />
    </div>
  );
}
