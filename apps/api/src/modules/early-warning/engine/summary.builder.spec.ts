import { SummaryBuilder } from './summary.builder';
import type { DetectedSignal } from './types';

describe('SummaryBuilder', () => {
  const builder = new SummaryBuilder();

  // ─── Trend sentence generation ──────────────────────────────────────────

  describe('buildSummary — trend sentence', () => {
    it('should report "increased" when score went up over past weeks', () => {
      // 14 days of history: first 7 averaging ~30, last 7 averaging ~50
      const trendHistory = [28, 29, 30, 31, 30, 32, 31, 45, 48, 50, 51, 50, 52, 51];
      const currentScore = 55;
      const signals: DetectedSignal[] = [];

      const result = builder.buildSummary(currentScore, trendHistory, signals);

      expect(result).toMatch(/^Risk score increased from \d+ to 55 over the past 2 weeks\./);
    });

    it('should report "decreased" when score went down', () => {
      const trendHistory = [70, 68, 65, 60, 55, 50, 45];
      const currentScore = 40;
      const signals: DetectedSignal[] = [];

      const result = builder.buildSummary(currentScore, trendHistory, signals);

      expect(result).toMatch(/^Risk score decreased from \d+ to 40 over the past 1 week\./);
    });

    it('should report "stable" when score has not changed significantly', () => {
      const trendHistory = [42, 43, 41, 42, 43, 42, 41];
      const currentScore = 42;
      const signals: DetectedSignal[] = [];

      const result = builder.buildSummary(currentScore, trendHistory, signals);

      expect(result).toMatch(/^Risk score stable at 42\./);
    });

    it('should handle empty trend history (first computation)', () => {
      const result = builder.buildSummary(35, [], []);

      expect(result).toBe('Risk score is 35.');
    });

    it('should handle single-entry trend history', () => {
      const result = builder.buildSummary(45, [35], []);

      expect(result).toMatch(/^Risk score increased from 35 to 45 over the past 1 week\./);
    });
  });

  // ─── Signal fragment inclusion ──────────────────────────────────────────

  describe('buildSummary — signal fragments', () => {
    const makeSignal = (fragment: string, contribution: number): DetectedSignal => ({
      signalType: 'test',
      severity: 'medium',
      scoreContribution: contribution,
      details: {},
      sourceEntityType: 'Test',
      sourceEntityId: 'test-id',
      summaryFragment: fragment,
    });

    it('should include top 5 signals sorted by scoreContribution descending', () => {
      const signals = [
        makeSignal('Signal A', 5),
        makeSignal('Signal B', 20),
        makeSignal('Signal C', 15),
        makeSignal('Signal D', 10),
        makeSignal('Signal E', 25),
        makeSignal('Signal F', 8),
        makeSignal('Signal G', 3),
      ];

      const result = builder.buildSummary(50, [], signals);

      // Should contain top 5: E(25), B(20), C(15), D(10), F(8)
      expect(result).toContain('Signal E');
      expect(result).toContain('Signal B');
      expect(result).toContain('Signal C');
      expect(result).toContain('Signal D');
      expect(result).toContain('Signal F');
      // Should NOT contain bottom 2: A(5), G(3)
      expect(result).not.toContain('Signal A');
      expect(result).not.toContain('Signal G');
    });

    it('should include all signals when fewer than 5', () => {
      const signals = [
        makeSignal('Only signal A', 10),
        makeSignal('Only signal B', 5),
      ];

      const result = builder.buildSummary(30, [], signals);

      expect(result).toContain('Only signal A');
      expect(result).toContain('Only signal B');
    });

    it('should handle zero signals gracefully', () => {
      const result = builder.buildSummary(0, [], []);

      expect(result).toBe('Risk score is 0.');
    });

    it('should join fragments with a space', () => {
      const signals = [
        makeSignal('Absent 3 consecutive days.', 20),
        makeSignal('Maths grade dropped from B+ to C-.', 15),
      ];

      const result = builder.buildSummary(50, [], signals);

      // Trend sentence followed by space-separated fragments
      expect(result).toContain('Absent 3 consecutive days. Maths grade dropped from B+ to C-.');
    });
  });

  // ─── Combined trend + signals ───────────────────────────────────────────

  describe('buildSummary — combined output', () => {
    const makeSignal = (fragment: string, contribution: number): DetectedSignal => ({
      signalType: 'test',
      severity: 'high',
      scoreContribution: contribution,
      details: {},
      sourceEntityType: 'Test',
      sourceEntityId: 'test-id',
      summaryFragment: fragment,
    });

    it('should produce trend sentence followed by signal fragments', () => {
      const trendHistory = [30, 35, 40, 45, 50, 55, 60, 65, 68, 70, 71, 72, 73, 74];
      const signals = [
        makeSignal('Absent 4 of last 10 school days.', 25),
        makeSignal('Two negative behaviour incidents in 14 days.', 15),
      ];

      const result = builder.buildSummary(75, trendHistory, signals);

      // Should start with trend sentence
      expect(result).toMatch(/^Risk score increased/);
      // Should end with signal fragments
      expect(result).toContain('Absent 4 of last 10 school days.');
      expect(result).toContain('Two negative behaviour incidents in 14 days.');
    });
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────

  describe('buildSummary — edge cases', () => {
    it('should handle score of 0 with signals', () => {
      const signals: DetectedSignal[] = [{
        signalType: 'test',
        severity: 'low',
        scoreContribution: 0,
        details: {},
        sourceEntityType: 'Test',
        sourceEntityId: 'test-id',
        summaryFragment: 'No issues detected.',
      }];

      const result = builder.buildSummary(0, [], signals);

      expect(result).toContain('Risk score is 0.');
      expect(result).toContain('No issues detected.');
    });

    it('should handle score of 100', () => {
      const result = builder.buildSummary(100, [90, 95, 98], []);

      expect(result).toMatch(/Risk score increased from \d+ to 100/);
    });

    it('should skip signals with empty summaryFragment', () => {
      const signals: DetectedSignal[] = [
        {
          signalType: 'test',
          severity: 'medium',
          scoreContribution: 10,
          details: {},
          sourceEntityType: 'Test',
          sourceEntityId: 'test-id',
          summaryFragment: '',
        },
        {
          signalType: 'test2',
          severity: 'medium',
          scoreContribution: 5,
          details: {},
          sourceEntityType: 'Test',
          sourceEntityId: 'test-id-2',
          summaryFragment: 'Valid fragment.',
        },
      ];

      const result = builder.buildSummary(30, [], signals);

      expect(result).toContain('Valid fragment.');
      // Should not have double spaces from empty fragment
      expect(result).not.toContain('  ');
    });
  });
});
