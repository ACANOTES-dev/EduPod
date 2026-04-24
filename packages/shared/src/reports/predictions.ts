import { z } from 'zod';

// ─── Confidence Level ──────────────────────────────────────────────────────

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

// ─── Student Risk Prediction ───────────────────────────────────────────────

export const StudentRiskFactorSchema = z.object({
  label: z.string(),
  weight: z.enum(['high', 'medium', 'low']),
});

export const StudentRiskPredictionSchema = z.object({
  risk_score: z.number().int().min(0).max(100),
  narrative: z.string(),
  factors: z.array(StudentRiskFactorSchema),
  confidence: ConfidenceLevelSchema,
  generated_at: z.string().datetime(),
  cache_hit: z.boolean(),
});

export type StudentRiskPrediction = z.infer<typeof StudentRiskPredictionSchema>;

// ─── Attendance Forecast ───────────────────────────────────────────────────

export const AttendanceForecastWeekSchema = z.object({
  week_start: z.string(),
  predicted_rate: z.number().min(0).max(100),
  confidence_interval: z.tuple([z.number(), z.number()]),
});

export const AttendanceForecastSchema = z.object({
  forecast: z.array(AttendanceForecastWeekSchema),
  narrative: z.string(),
  generated_at: z.string().datetime(),
  cache_hit: z.boolean(),
  confidence: ConfidenceLevelSchema,
});

export type AttendanceForecast = z.infer<typeof AttendanceForecastSchema>;

// ─── Cash Flow Forecast ────────────────────────────────────────────────────

export const CashFlowForecastDaySchema = z.object({
  date: z.string(),
  expected_receipts: z.number().min(0),
  confidence_interval: z.tuple([z.number(), z.number()]),
});

export const CashFlowForecastSchema = z.object({
  forecast: z.array(CashFlowForecastDaySchema),
  narrative: z.string(),
  generated_at: z.string().datetime(),
  cache_hit: z.boolean(),
  confidence: ConfidenceLevelSchema,
});

export type CashFlowForecast = z.infer<typeof CashFlowForecastSchema>;

// ─── AI Response from Claude (before validation) ──────────────────────────

export const AiPredictionRawResponseSchema = z.object({
  risk_score: z.number().optional(),
  narrative: z.string().optional(),
  factors: z.array(StudentRiskFactorSchema).optional(),
  confidence: z.string().optional(),
  forecast: z.array(z.unknown()).optional(),
});

export type AiPredictionRawResponse = z.infer<typeof AiPredictionRawResponseSchema>;
