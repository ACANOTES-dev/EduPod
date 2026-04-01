import type { SubstitutionPressure } from './workload-compute.service';
import { WorkloadMetricsService } from './workload-metrics.service';

export class WorkloadTrendAnalysisService {
  computeSeasonalPattern(
    absences: { absence_date: Date }[],
    staffCount: number,
  ): { month: number; average_rate: number }[] {
    const monthCounts = new Map<number, number[]>();
    for (const absence of absences) {
      const month = absence.absence_date.getMonth() + 1;
      if (!monthCounts.has(month)) {
        monthCounts.set(month, []);
      }
      const counts = monthCounts.get(month);
      if (counts) counts.push(1);
    }

    return Array.from(monthCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([month, counts]) => ({
        month,
        average_rate: WorkloadMetricsService.round2(counts.length / staffCount),
      }));
  }

  computeMonthlyPressureTrend(
    absences: { absence_date: Date }[],
    substitutions: { created_at: Date }[],
    staffCount: number,
  ): SubstitutionPressure['trend'] {
    const absenceByMonth = new Map<string, number>();
    for (const absence of absences) {
      const key = `${absence.absence_date.getFullYear()}-${String(absence.absence_date.getMonth() + 1).padStart(2, '0')}`;
      absenceByMonth.set(key, (absenceByMonth.get(key) ?? 0) + 1);
    }

    const substitutionsByMonth = new Map<string, number>();
    for (const substitution of substitutions) {
      const key = `${substitution.created_at.getFullYear()}-${String(substitution.created_at.getMonth() + 1).padStart(2, '0')}`;
      substitutionsByMonth.set(key, (substitutionsByMonth.get(key) ?? 0) + 1);
    }

    const allMonths = new Set([...absenceByMonth.keys(), ...substitutionsByMonth.keys()]);
    const sortedMonths = Array.from(allMonths).sort();

    return sortedMonths.map((month) => {
      const absenceCount = absenceByMonth.get(month) ?? 0;
      const substitutionCount = substitutionsByMonth.get(month) ?? 0;
      const daysInMonth = 20;
      const absenceRate =
        staffCount > 0 && daysInMonth > 0 ? absenceCount / staffCount / daysInMonth : 0;
      const coverDiff = absenceCount > 0 ? substitutionCount / absenceCount : 0;
      const unfilledRate =
        absenceCount > 0 ? Math.max(0, absenceCount - substitutionCount) / absenceCount : 0;
      const score = absenceRate * 0.4 + (1 - coverDiff) * 0.3 + unfilledRate * 0.3;

      return {
        month,
        score: WorkloadMetricsService.round2(score),
      };
    });
  }

  describeCorrelationTrend(
    series: { month: string; coverPressure: number; absenceRate: number }[],
  ): string {
    if (series.length < 2) return 'Insufficient data for trend analysis.';

    const recentHalf = series.slice(Math.floor(series.length / 2));
    const earlyHalf = series.slice(0, Math.floor(series.length / 2));

    const recentAvgAbsence = WorkloadMetricsService.mean(
      recentHalf.map((item) => item.absenceRate),
    );
    const earlyAvgAbsence = WorkloadMetricsService.mean(earlyHalf.map((item) => item.absenceRate));

    const recentAvgCover = WorkloadMetricsService.mean(
      recentHalf.map((item) => item.coverPressure),
    );
    const earlyAvgCover = WorkloadMetricsService.mean(earlyHalf.map((item) => item.coverPressure));

    const absenceTrend =
      recentAvgAbsence > earlyAvgAbsence * 1.1
        ? 'increasing'
        : recentAvgAbsence < earlyAvgAbsence * 0.9
          ? 'decreasing'
          : 'stable';

    const coverTrend =
      recentAvgCover > earlyAvgCover * 1.1
        ? 'increasing'
        : recentAvgCover < earlyAvgCover * 0.9
          ? 'decreasing'
          : 'stable';

    return `Absence rates are ${absenceTrend} and cover pressure is ${coverTrend} over the observed period.`;
  }
}
