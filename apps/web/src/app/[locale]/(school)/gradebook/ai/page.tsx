'use client';

import { Clock, Download, Loader2, Search, Sparkles } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, StatusBadge, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueryResult {
  columns: string[];
  rows: Record<string, string | number | null>[];
  student_id_column?: string;
}

interface QueryHistoryItem {
  id: string;
  query_text: string;
  executed_at: string;
  result_count: number;
}

interface HistoryResponse {
  data: QueryHistoryItem[];
}

// ─── Suggested queries ────────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  'aiSuggestion1',
  'aiSuggestion2',
  'aiSuggestion3',
  'aiSuggestion4',
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiQueryPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<QueryResult | null>(null);
  const [history, setHistory] = React.useState<QueryHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);

  React.useEffect(() => {
    apiClient<HistoryResponse>('/api/v1/gradebook/ai-query/history?pageSize=10')
      .then((res) => setHistory(res.data))
      .catch((err) => { console.error('[GradebookAiPage]', err); })
      .finally(() => setLoadingHistory(false));
  }, []);

  const handleSubmit = async (queryText: string) => {
    if (!queryText.trim()) return;
    setQuery(queryText);
    setLoading(true);
    setResult(null);
    try {
      const res = await apiClient<{ data: QueryResult }>('/api/v1/gradebook/ai-query', {
        method: 'POST',
        body: JSON.stringify({ query: queryText }),
      });
      setResult(res.data);
      // Refresh history
      const hist = await apiClient<HistoryResponse>(
        '/api/v1/gradebook/ai-query/history?pageSize=10',
      );
      setHistory(hist.data);
    } catch (err) {
      console.error('[GradebookAiPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!result) return;
    const headers = result.columns.join(',');
    const rows = result.rows
      .map((row) =>
        result.columns
          .map((col) => {
            const val = row[col];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(','),
      )
      .join('\n');
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-query-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStudentClick = (row: Record<string, string | number | null>) => {
    if (!result?.student_id_column) return;
    const id = row[result.student_id_column];
    if (id) {
      router.push(`/${locale}/students/${String(id)}`);
    }
  };

  const isStudentRow = !!result?.student_id_column;

  return (
    <div className="space-y-6">
      <PageHeader title={t('aiQueryTitle')} description={t('aiQueryDescription')} />

      {/* Search bar */}
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 shrink-0 text-primary-600" />
          <span className="text-sm font-semibold text-text-primary">{t('aiQueryAsk')}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  void handleSubmit(query);
                }
              }}
              placeholder={t('aiQueryPlaceholder')}
              className="ps-10 text-sm"
              disabled={loading}
            />
          </div>
          <Button
            onClick={() => void handleSubmit(query)}
            disabled={!query.trim() || loading}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t('aiQuerySearching')}
              </>
            ) : (
              t('aiQuerySearch')
            )}
          </Button>
        </div>

        {/* Suggested queries */}
        {!result && !loading && (
          <div className="space-y-2">
            <p className="text-xs text-text-tertiary">{t('aiQuerySuggestedTitle')}</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUERIES.map((key) => (
                <button
                  key={key}
                  onClick={() => void handleSubmit(t(key))}
                  className="rounded-full border border-border bg-surface-secondary px-3 py-1 text-xs text-text-secondary hover:bg-surface hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results area */}
      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            <p className="text-sm text-text-secondary">{t('aiQueryAnalyzing')}</p>
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <StatusBadge status="success">
                {t('aiQueryResultCount', { count: result.rows.length })}
              </StatusBadge>
            </div>
            <Button size="sm" variant="outline" onClick={handleExportCsv}>
              <Download className="me-2 h-4 w-4" />
              {t('aiQueryExportCsv')}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  {result.columns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={result.columns.length}
                      className="px-4 py-12 text-center text-sm text-text-tertiary"
                    >
                      {t('aiQueryNoResults')}
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary ${
                        isStudentRow ? 'cursor-pointer' : ''
                      }`}
                      onClick={() => isStudentRow && handleStudentClick(row)}
                    >
                      {result.columns.map((col) => (
                        <td key={col} className="px-4 py-3 text-sm text-text-primary">
                          {row[col] !== null && row[col] !== undefined ? String(row[col]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent query history */}
      {!result && !loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">{t('aiQueryRecentTitle')}</span>
          </div>
          {loadingHistory ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t('aiQueryNoHistory')}</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void handleSubmit(item.query_text)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-start hover:bg-surface-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  <span className="text-sm text-text-primary line-clamp-1">{item.query_text}</span>
                  <div className="flex shrink-0 items-center gap-3 ms-4">
                    <span className="text-xs text-text-tertiary font-mono" dir="ltr">
                      {item.result_count} {t('aiQueryRows')}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {new Date(item.executed_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
