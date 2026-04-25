/**
 * Shared types for the prediction panel — extracted into a tiny module so
 * that the helpers spec (`prediction-panel.helpers.spec.ts`) can import
 * them without dragging in React / Recharts under the web app's `node`
 * jest environment.
 */

export type PredictionKind = 'student_risk' | 'attendance_forecast' | 'cash_flow';
