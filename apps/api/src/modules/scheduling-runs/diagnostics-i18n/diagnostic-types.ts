/**
 * Shared types for the diagnostics module (Stage 12).
 *
 * These types power the feasibility sweep, IIS refinement,
 * ranked solutions, and the UI rendering.
 */
import type { DiagnosticCode } from './diagnostic-codes';

// ─── Solution shape ─────────────────────────────────────────────────────────

export interface DiagnosticSolution {
  id: string;
  headline: string;
  detail: string;
  effort: 'quick' | 'medium' | 'long';
  impact: {
    would_unblock_periods: number;
    would_unblock_percentage: number;
    side_effects: string[];
    confidence: 'high' | 'medium' | 'low';
  };
  link: { href: string; label: string };
  affected_entities: {
    teachers?: string[];
    subjects?: string[];
    classes?: string[];
    rooms?: string[];
  };
}

// ─── Feasibility types (§A) ─────────────────────────────────────────────────

export type FeasibilityVerdict = 'feasible' | 'infeasible' | 'tight';

export interface FeasibilityBlocker {
  id: string;
  check: DiagnosticCode;
  severity: 'critical' | 'high';
  headline: string;
  detail: string;
  affected: {
    teachers?: Array<{ id: string; name: string }>;
    classes?: Array<{ id: string; label: string }>;
    subjects?: Array<{ id: string; name: string }>;
    rooms?: Array<{ id: string; name: string }>;
    slots?: Array<{ day: string; period: number }>;
  };
  quantified_impact: {
    blocked_periods: number;
    blocked_percentage: number;
  };
  solutions: DiagnosticSolution[];
}

export interface FeasibilityCheck {
  code: DiagnosticCode;
  passed: boolean;
  detail?: string;
}

export interface FeasibilityReport {
  verdict: FeasibilityVerdict;
  checks: FeasibilityCheck[];
  ceiling: {
    total_demand_periods: number;
    total_qualified_teacher_periods: number;
    slack_periods: number;
  };
  diagnosed_blockers: FeasibilityBlocker[];
}

// ─── Diagnostic entry (replaces legacy Diagnostic shape) ────────────────────

export type DiagnosticSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface DiagnosticEntry {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCode;
  headline: string;
  detail: string;
  solutions: DiagnosticSolution[];
  affected: {
    subject?: { id: string; name: string };
    year_group?: { id: string; name: string };
    classes?: Array<{ id: string; name: string }>;
    teachers?: Array<{ id: string; name: string }>;
    rooms?: Array<{ id: string; name: string }>;
  };
  quantified_impact?: {
    blocked_periods: number;
    blocked_percentage: number;
  };
  metrics?: Record<string, number>;
}

// ─── Diagnostics result (returned to UI) ────────────────────────────────────

export interface DiagnosticsSummary {
  total_unassigned_periods: number;
  total_unassigned_gaps: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  can_proceed: boolean;
  feasibility_verdict: FeasibilityVerdict | null;
  structural_blockers: number;
  budget_bound: number;
  pin_conflict: number;
}

export interface DiagnosticsResult {
  summary: DiagnosticsSummary;
  diagnostics: DiagnosticEntry[];
  feasibility?: FeasibilityReport;
  why_not_100?: WhyNot100;
}

export interface WhyNot100 {
  structural: number;
  pin_conflict: number;
  budget_bound: number;
  total_unplaced: number;
}

// ─── Translation context (§C) ──────────────────────────────────────────────

export interface DiagnosticContext {
  teacher?: { id: string; name: string };
  subject?: { id: string; name: string };
  year_group?: { id: string; name: string };
  class_label?: string;
  room?: { id: string; name: string };
  shortfall_periods?: number;
  demand_periods?: number;
  supply_periods?: number;
  total_unassigned?: number;
  blocked_periods?: number;
  additional_teachers?: number;
  cap_value?: number;
  slot_count?: number;
}

export interface DiagnosticTranslation {
  headline: (ctx: DiagnosticContext) => string;
  detail: (ctx: DiagnosticContext) => string;
  solution_templates: Array<{
    id: string;
    effort: 'quick' | 'medium' | 'long';
    headline: (ctx: DiagnosticContext) => string;
    detail: (ctx: DiagnosticContext) => string;
    link_template: (ctx: DiagnosticContext) => string;
  }>;
}
