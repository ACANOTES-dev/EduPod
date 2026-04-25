import type {
  ReportsAiFeatureState,
  ReportsSettingsResponse,
} from '@school/shared/reports';

import {
  buildDefaultsFormValues,
  findAiFeature,
  formatCostUsd,
  formatUsageCount,
  isKpiHidden,
  resolveActiveTab,
  resolveScrollTarget,
  toggleHiddenKpi,
} from './reports-settings.helpers';

describe('reports-settings.helpers', () => {
  describe('resolveActiveTab', () => {
    it('returns ai-features when input is null/undefined', () => {
      expect(resolveActiveTab(null)).toBe('ai-features');
      expect(resolveActiveTab(undefined)).toBe('ai-features');
    });

    it('returns ai-features for unknown values', () => {
      expect(resolveActiveTab('garbage')).toBe('ai-features');
    });

    it.each(['ai-features', 'kpi-dashboard', 'defaults'] as const)(
      'returns %s for valid input',
      (tab) => {
        expect(resolveActiveTab(tab)).toBe(tab);
      },
    );
  });

  describe('resolveScrollTarget', () => {
    it('returns null for empty/undefined hash', () => {
      expect(resolveScrollTarget(null)).toBeNull();
      expect(resolveScrollTarget('')).toBeNull();
      expect(resolveScrollTarget(undefined)).toBeNull();
    });

    it('strips leading # and matches a known key', () => {
      expect(resolveScrollTarget('#reports_narration')).toBe('reports_narration');
      expect(resolveScrollTarget('reports_ask_ai')).toBe('reports_ask_ai');
      expect(resolveScrollTarget('#reports_predictions')).toBe('reports_predictions');
    });

    it('returns null for unknown hash', () => {
      expect(resolveScrollTarget('#wellbeing_behaviour')).toBeNull();
      expect(resolveScrollTarget('#reports')).toBeNull();
    });
  });

  describe('formatCostUsd', () => {
    it('formats zero / negative as $0.00', () => {
      expect(formatCostUsd(0)).toBe('$0.00');
      expect(formatCostUsd(-1)).toBe('$0.00');
      expect(formatCostUsd(NaN)).toBe('$0.00');
    });

    it('formats sub-dollar with three decimals', () => {
      expect(formatCostUsd(0.012)).toBe('$0.012');
      expect(formatCostUsd(0.999)).toBe('$0.999');
    });

    it('formats single-digit dollars with two decimals', () => {
      expect(formatCostUsd(1.234)).toBe('$1.23');
      expect(formatCostUsd(9.99)).toBe('$9.99');
    });

    it('rounds to whole dollars at $10+', () => {
      expect(formatCostUsd(10.4)).toBe('$10');
      expect(formatCostUsd(123.7)).toBe('$124');
    });
  });

  describe('formatUsageCount', () => {
    it('floors and bounds at zero', () => {
      expect(formatUsageCount(0)).toBe(0);
      expect(formatUsageCount(7)).toBe(7);
      expect(formatUsageCount(7.9)).toBe(7);
      expect(formatUsageCount(-1)).toBe(0);
      expect(formatUsageCount(NaN)).toBe(0);
    });
  });

  describe('toggleHiddenKpi', () => {
    it('adds a key when hide=true', () => {
      const next = toggleHiddenKpi([], 'attendance_today', true);
      expect(next).toEqual(['attendance_today']);
    });

    it('does not duplicate when adding an existing key', () => {
      const next = toggleHiddenKpi(['attendance_today'], 'attendance_today', true);
      expect(next).toEqual(['attendance_today']);
    });

    it('removes a key when hide=false', () => {
      const next = toggleHiddenKpi(
        ['attendance_today', 'parent_escalations'],
        'parent_escalations',
        false,
      );
      expect(next).toEqual(['attendance_today']);
    });

    it('returns a new array reference (no mutation)', () => {
      const original = ['attendance_today'] as const;
      const next = toggleHiddenKpi([...original], 'overdue_invoices', true);
      expect(next).not.toBe(original);
    });
  });

  describe('isKpiHidden', () => {
    it('returns true when key is in hidden list', () => {
      expect(isKpiHidden(['attendance_today'], 'attendance_today')).toBe(true);
    });
    it('returns false when key is not in list', () => {
      expect(isKpiHidden(['attendance_today'], 'overdue_invoices')).toBe(false);
      expect(isKpiHidden([], 'attendance_today')).toBe(false);
    });
  });

  describe('findAiFeature', () => {
    const features: ReportsAiFeatureState[] = [
      {
        module_key: 'reports_narration',
        enabled: true,
        updated_at: '2026-04-25T10:00:00.000Z',
        updated_by: null,
        usage: { monthly_usage: 5, cost_estimate_usd: 0.05 },
      },
    ];

    it('returns the matching feature when present', () => {
      const f = findAiFeature(features, 'reports_narration');
      expect(f.enabled).toBe(true);
      expect(f.usage.monthly_usage).toBe(5);
    });

    it('returns a default-disabled placeholder when missing', () => {
      const f = findAiFeature(features, 'reports_predictions');
      expect(f.module_key).toBe('reports_predictions');
      expect(f.enabled).toBe(false);
      expect(f.usage.monthly_usage).toBe(0);
      expect(f.usage.cost_estimate_usd).toBe(0);
      expect(f.updated_by).toBeNull();
    });
  });

  describe('buildDefaultsFormValues', () => {
    it('extracts defaults from the response shape', () => {
      const res: ReportsSettingsResponse = {
        defaults: {
          default_export_format: 'docx',
          default_schedule_timezone: 'Asia/Dubai',
          default_share_visibility: 'shared',
        },
        kpi_preferences: { hidden_kpi_keys: [], updated_at: null, updated_by: null },
        ai_features: [],
        snapshot_retention_days: 90,
      };
      expect(buildDefaultsFormValues(res)).toEqual({
        default_export_format: 'docx',
        default_schedule_timezone: 'Asia/Dubai',
        default_share_visibility: 'shared',
      });
    });
  });
});
