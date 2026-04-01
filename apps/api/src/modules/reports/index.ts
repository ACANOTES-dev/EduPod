/**
 * Public API for the ReportsModule.
 * Import from this barrel (or via NestJS DI) — do NOT import internal files directly.
 */
export { ReportsModule } from './reports.module';
export { ReportAlertsService } from './report-alerts.service';
export { ReportsDataAccessService } from './reports-data-access.service';
export { ReportsService } from './reports.service';
export { ScheduledReportsService } from './scheduled-reports.service';
export { UnifiedDashboardService } from './unified-dashboard.service';
