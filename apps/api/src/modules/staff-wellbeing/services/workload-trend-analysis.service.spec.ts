import { WorkloadTrendAnalysisService } from './workload-trend-analysis.service';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkloadTrendAnalysisService', () => {
  let service: WorkloadTrendAnalysisService;

  beforeEach(() => {
    service = new WorkloadTrendAnalysisService();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── computeSeasonalPattern ─────────────────────────────────────────────────

  describe('WorkloadTrendAnalysisService — computeSeasonalPattern', () => {
    it('should return empty array for no absences', () => {
      const result = service.computeSeasonalPattern([], 10);
      expect(result).toEqual([]);
    });

    it('should group absences by month and compute rate per staff count', () => {
      const absences = [
        { absence_date: new Date('2026-01-05') },
        { absence_date: new Date('2026-01-12') },
        { absence_date: new Date('2026-02-03') },
      ];
      const result = service.computeSeasonalPattern(absences, 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ month: 1, average_rate: 0.2 }); // 2 absences / 10 staff
      expect(result[1]).toEqual({ month: 2, average_rate: 0.1 }); // 1 absence / 10 staff
    });

    it('should return sorted results by month', () => {
      const absences = [
        { absence_date: new Date('2026-03-01') },
        { absence_date: new Date('2026-01-01') },
      ];
      const result = service.computeSeasonalPattern(absences, 5);

      expect(result[0]?.month).toBe(1);
      expect(result[1]?.month).toBe(3);
    });

    it('should round rates to 2 decimal places', () => {
      const absences = [
        { absence_date: new Date('2026-01-01') },
        { absence_date: new Date('2026-01-02') },
        { absence_date: new Date('2026-01-03') },
      ];
      const result = service.computeSeasonalPattern(absences, 7);

      // 3/7 = 0.4285... rounded to 0.43
      expect(result[0]?.average_rate).toBe(0.43);
    });
  });

  // ─── computeMonthlyPressureTrend ────────────────────────────────────────────

  describe('WorkloadTrendAnalysisService — computeMonthlyPressureTrend', () => {
    it('should return empty array when no data provided', () => {
      const result = service.computeMonthlyPressureTrend([], [], 10);
      expect(result).toEqual([]);
    });

    it('should produce one entry per month from combined absence and substitution data', () => {
      const absences = [
        { absence_date: new Date('2026-01-10') },
        { absence_date: new Date('2026-01-15') },
        { absence_date: new Date('2026-02-05') },
      ];
      const substitutions = [
        { created_at: new Date('2026-01-10') },
        { created_at: new Date('2026-02-05') },
      ];
      const result = service.computeMonthlyPressureTrend(absences, substitutions, 10);

      expect(result).toHaveLength(2);
      expect(result[0]?.month).toBe('2026-01');
      expect(result[1]?.month).toBe('2026-02');
    });

    it('should compute pressure score components correctly', () => {
      // 1 absence, 1 substitution, 10 staff
      const absences = [{ absence_date: new Date('2026-03-10') }];
      const substitutions = [{ created_at: new Date('2026-03-10') }];
      const result = service.computeMonthlyPressureTrend(absences, substitutions, 10);

      expect(result).toHaveLength(1);
      // absenceRate = 1/(10*20) = 0.005
      // coverDiff = 1/1 = 1
      // unfilledRate = max(0, (1-1)/1) = 0
      // score = 0.005*0.4 + (1-1)*0.3 + 0*0.3 = 0.002 -> rounded to 0
      expect(result[0]?.score).toBeCloseTo(0, 1);
    });

    it('should handle months with absences but no substitutions', () => {
      const absences = [
        { absence_date: new Date('2026-04-01') },
        { absence_date: new Date('2026-04-15') },
      ];
      const result = service.computeMonthlyPressureTrend(absences, [], 10);

      expect(result).toHaveLength(1);
      // coverDiff = 0/2 = 0 -> (1-0)*0.3 = 0.3
      // unfilledRate = (2-0)/2 = 1 -> 1*0.3 = 0.3
      // absenceRate = 2/(10*20) = 0.01 -> 0.01*0.4 = 0.004
      // total = 0.604
      expect(result[0]?.score).toBeGreaterThan(0.5);
    });

    it('should sort months chronologically', () => {
      const absences = [
        { absence_date: new Date('2026-03-01') },
        { absence_date: new Date('2026-01-01') },
      ];
      const result = service.computeMonthlyPressureTrend(absences, [], 10);

      expect(result[0]?.month).toBe('2026-01');
      expect(result[1]?.month).toBe('2026-03');
    });
  });

  // ─── describeCorrelationTrend ───────────────────────────────────────────────

  describe('WorkloadTrendAnalysisService — describeCorrelationTrend', () => {
    it('should return insufficient data message for fewer than 2 data points', () => {
      expect(service.describeCorrelationTrend([])).toBe('Insufficient data for trend analysis.');
      expect(
        service.describeCorrelationTrend([
          { month: '2026-01', coverPressure: 0.5, absenceRate: 0.1 },
        ]),
      ).toBe('Insufficient data for trend analysis.');
    });

    it('should identify increasing absence and cover trends', () => {
      const series = [
        { month: '2026-01', coverPressure: 0.1, absenceRate: 0.05 },
        { month: '2026-02', coverPressure: 0.15, absenceRate: 0.06 },
        { month: '2026-03', coverPressure: 0.4, absenceRate: 0.15 },
        { month: '2026-04', coverPressure: 0.5, absenceRate: 0.2 },
      ];
      const result = service.describeCorrelationTrend(series);

      expect(result).toContain('increasing');
    });

    it('should identify stable trends when values are similar', () => {
      const series = [
        { month: '2026-01', coverPressure: 0.3, absenceRate: 0.1 },
        { month: '2026-02', coverPressure: 0.31, absenceRate: 0.1 },
        { month: '2026-03', coverPressure: 0.3, absenceRate: 0.1 },
        { month: '2026-04', coverPressure: 0.29, absenceRate: 0.1 },
      ];
      const result = service.describeCorrelationTrend(series);

      expect(result).toContain('stable');
    });

    it('should identify decreasing trends', () => {
      const series = [
        { month: '2026-01', coverPressure: 0.8, absenceRate: 0.3 },
        { month: '2026-02', coverPressure: 0.7, absenceRate: 0.25 },
        { month: '2026-03', coverPressure: 0.2, absenceRate: 0.05 },
        { month: '2026-04', coverPressure: 0.1, absenceRate: 0.02 },
      ];
      const result = service.describeCorrelationTrend(series);

      expect(result).toContain('decreasing');
    });

    it('should always return a well-formed sentence', () => {
      const series = [
        { month: '2026-01', coverPressure: 0.1, absenceRate: 0.05 },
        { month: '2026-02', coverPressure: 0.2, absenceRate: 0.1 },
      ];
      const result = service.describeCorrelationTrend(series);

      expect(result).toMatch(/^Absence rates are (increasing|decreasing|stable)/);
      expect(result).toMatch(/cover pressure is (increasing|decreasing|stable)/);
    });
  });
});
