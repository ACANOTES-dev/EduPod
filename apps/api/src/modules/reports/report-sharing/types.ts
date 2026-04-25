/**
 * Local re-exports of the share types from `@school/shared/reports`.
 * Centralising them here keeps service / controller imports tidy and
 * avoids spreading the shared subpath across the module.
 */
export type {
  CreateReportShareDto,
  ReportShareArtifactFormat,
  ReportShareAudience,
  ReportShareFormat,
  ReportShareHistoryEntry,
  ReportShareHistoryResponse,
  ShareReportResponse,
  SharedSnapshotArtifact,
  SharedSnapshotView,
} from '@school/shared/reports';
