import { buildSignal, mapSeverity } from './collector-utils';

describe('collector-utils', () => {
  afterEach(() => jest.clearAllMocks());

  describe('mapSeverity', () => {
    it('should return low for score <= 10', () => {
      expect(mapSeverity(0)).toBe('low');
      expect(mapSeverity(5)).toBe('low');
      expect(mapSeverity(10)).toBe('low');
    });

    it('should return medium for score 11-20', () => {
      expect(mapSeverity(11)).toBe('medium');
      expect(mapSeverity(15)).toBe('medium');
      expect(mapSeverity(20)).toBe('medium');
    });

    it('should return high for score 21-30', () => {
      expect(mapSeverity(21)).toBe('high');
      expect(mapSeverity(25)).toBe('high');
      expect(mapSeverity(30)).toBe('high');
    });

    it('should return critical for score > 30', () => {
      expect(mapSeverity(31)).toBe('critical');
      expect(mapSeverity(50)).toBe('critical');
      expect(mapSeverity(100)).toBe('critical');
    });
  });

  describe('buildSignal', () => {
    it('should build a signal with severity mapped from scoreContribution', () => {
      const signal = buildSignal({
        signalType: 'test_signal',
        scoreContribution: 15,
        details: { key: 'value' },
        sourceEntityType: 'Student',
        sourceEntityId: 'stu-1',
        summaryFragment: 'Test summary',
      });

      expect(signal.signalType).toBe('test_signal');
      expect(signal.severity).toBe('medium');
      expect(signal.scoreContribution).toBe(15);
      expect(signal.details).toEqual({ key: 'value' });
      expect(signal.summaryFragment).toBe('Test summary');
    });

    it('should set critical severity for high score', () => {
      const signal = buildSignal({
        signalType: 'critical_signal',
        scoreContribution: 50,
        details: {},
        sourceEntityType: 'Student',
        sourceEntityId: 'stu-1',
        summaryFragment: 'Critical',
      });
      expect(signal.severity).toBe('critical');
    });
  });
});
