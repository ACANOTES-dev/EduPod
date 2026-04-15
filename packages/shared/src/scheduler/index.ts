export * from './types-v2';
export { solveV2 } from './solver-v2';
export type { SolverOptionsV2 } from './solver-v2';
export { checkHardConstraintsV2 } from './constraints-v2';
export { resolveTeacherCandidates, getTeacherAssignmentMode } from './domain-v2';
export type { TeacherAssignmentResolution } from './domain-v2';
export { validateSchedule } from './validation';
export { solveViaCpSat, CpSatSolveError } from './cp-sat-client';
export type { CpSatClientOptions } from './cp-sat-client';
