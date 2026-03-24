'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { apiClient } from '@/lib/api-client';

interface LinkedStudent {
  student_id: string;
  first_name: string;
  last_name: string;
  year_group_name: string | null;
  status: string;
}

interface AiInsightCardProps {
  students: LinkedStudent[];
}

interface InsightResponse {
  insights: { student_id: string; summary: string }[];
}

export function AiInsightCard({ students }: AiInsightCardProps) {
  const t = useTranslations('dashboard');
  const [insights, setInsights] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = students.filter((s) => s.status === 'active').map((s) => s.student_id);
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    apiClient<InsightResponse>('/api/v1/reports/parent-insights', {
      method: 'POST',
      body: JSON.stringify({ student_ids: ids }),
    })
      .then((res) => {
        const map: Record<string, string> = {};
        res.insights.forEach((i) => { map[i.student_id] = i.summary; });
        setInsights(map);
      })
      .catch(() => {
        // Fallback: generate a placeholder per student
        const map: Record<string, string> = {};
        students.forEach((s) => {
          map[s.student_id] = t('parentDashboard.aiInsightFallback', {
            name: s.first_name,
            yearGroup: s.year_group_name ?? '',
          });
        });
        setInsights(map);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students]);

  const activeStudents = students.filter((s) => s.status === 'active');
  if (activeStudents.length === 0 && !loading) return null;

  return (
    <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-violet-600" />
        <h2 className="text-base font-semibold text-violet-900">{t('parentDashboard.aiInsightTitle')}</h2>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-violet-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {activeStudents.map((student) => {
            const insight = insights[student.student_id];
            if (!insight) return null;
            return (
              <div
                key={student.student_id}
                className="rounded-xl bg-white/70 p-4 shadow-sm"
              >
                <p className="mb-1 text-xs font-semibold text-violet-700">
                  {student.first_name} {student.last_name}
                  {student.year_group_name && (
                    <span className="ms-1 font-normal text-violet-500">· {student.year_group_name}</span>
                  )}
                </p>
                <p className="text-sm leading-relaxed text-violet-900">{insight}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
