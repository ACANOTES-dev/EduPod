import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { ClassesModule } from '../classes/classes.module';
import { FinanceModule } from '../finance/finance.module';
import { HouseholdsModule } from '../households/households.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';
import { S3Module } from '../s3/s3.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';
import { TenantsModule } from '../tenants/tenants.module';

import { EventBudgetScenariosService } from './event-budgets/event-budget-scenarios.service';
import { EventBudgetsController } from './event-budgets/event-budgets.controller';
import { EventBudgetsService } from './event-budgets/event-budgets.service';
import { ExcelRendererService } from './exports/excel-renderer.service';
import { ExportsController } from './exports/exports.controller';
import { ExportsService } from './exports/exports.service';
import { PdfRendererService } from './exports/pdf-renderer.service';
import { FinancialModelsController } from './financial-models/financial-models.controller';
import { FinancialModelsService } from './financial-models/financial-models.service';
import { LineItemsController } from './line-items/line-items.controller';
import { LineItemsService } from './line-items/line-items.service';
import { ScenariosController } from './scenarios/scenarios.controller';
import { ScenariosService } from './scenarios/scenarios.service';
import { ShareableLinksController } from './shareable-links/shareable-links.controller';
import { ShareableLinksPublicController } from './shareable-links/shareable-links.public.controller';
import { ShareableLinksService } from './shareable-links/shareable-links.service';
import { SnapshotsController } from './snapshots/snapshots.controller';
import { SnapshotsService } from './snapshots/snapshots.service';
import { TenantPreferencesController } from './tenant-preferences/tenant-preferences.controller';
import { TenantPreferencesService } from './tenant-preferences/tenant-preferences.service';
import { TripFeeIntegrationController } from './trip-fee-integration/trip-fee-integration.controller';
import { TripFeeIntegrationService } from './trip-fee-integration/trip-fee-integration.service';
import { VarianceActualsSourceService } from './variance/variance-actuals-source.service';
import { VarianceController } from './variance/variance.controller';
import { VarianceService } from './variance/variance.service';

/**
 * Budgeting & Analysis ("Modeling") module — central registration point
 * for the rebuild's API surface.
 *
 * Phase 03 owns initial creation. Subsequent Wave 2 / Wave 3 phases
 * (line-items, snapshots, variance, event-budgets, exports, shareable
 * links, trip-fee-integration) extend this module's `controllers`,
 * `providers`, and `exports` arrays via fix-forward edits.
 *
 * `FinanceReadFacade` and `PayrollReadFacade` are injected via the
 * global `ReadFacadesModule`, so we don't import `PayrollModule` here —
 * that would pull a heavy module graph in for read-only access.
 */
@Module({
  imports: [
    PrismaModule,
    RbacModule, // PermissionGuard dependency
    AcademicsModule, // AcademicReadFacade for year-group metadata
    ClassesModule, // ClassesReadFacade for active class enrolment counts (Phase 07)
    FinanceModule, // FinanceReadFacade for fee structures + (later) prior-year actuals
    HouseholdsModule, // HouseholdReadFacade for active-household counts
    StaffProfilesModule, // StaffProfileReadFacade for staff_by_department snapshot
    StudentsModule, // StudentReadFacade for active student counts
    TenantsModule, // TenantReadFacade for currency_code + tenant metadata
    S3Module, // S3Service for snapshot PDF/Excel signed URLs (Phase 05)
    // Local re-registration so `@InjectQueue('budgeting')` resolves inside
    // SnapshotsService (Phase 05) and VarianceService (Phase 06). The
    // app-level registration in `apps/api/src/app.module.ts` is for the
    // root module only — feature modules need their own.
    BullModule.registerQueue({ name: 'budgeting' }),
  ],
  controllers: [
    FinancialModelsController,
    ScenariosController,
    LineItemsController,
    SnapshotsController,
    VarianceController,
    EventBudgetsController,
    ExportsController,
    TripFeeIntegrationController,
    ShareableLinksController,
    // Public open route — must be registered alongside the authenticated
    // controller so NestJS routes `/v1/budgeting/share/:token` without
    // any guard (the controller has no `@UseGuards`). See PLAN.md §11.2.
    ShareableLinksPublicController,
    TenantPreferencesController,
  ],
  providers: [
    FinancialModelsService,
    ScenariosService,
    LineItemsService,
    SnapshotsService,
    VarianceService,
    VarianceActualsSourceService,
    EventBudgetsService,
    EventBudgetScenariosService,
    ExportsService,
    PdfRendererService,
    ExcelRendererService,
    TripFeeIntegrationService,
    ShareableLinksService,
    TenantPreferencesService,
  ],
  exports: [
    FinancialModelsService,
    ScenariosService,
    LineItemsService,
    SnapshotsService,
    // Phase 08's variance-refresh worker imports VarianceActualsSourceService
    // directly to compose actuals; export it so a worker-side module can
    // pull it in without re-registering its dependencies.
    VarianceActualsSourceService,
    // Phase 10 (trip → fee integration) consumes EventBudgetsService for
    // its `runEngineForId` helper — exported so a sibling module can
    // depend on it without re-registering its DI graph.
    EventBudgetsService,
    // Phase 09's renderers — exported so the worker's board-pack-render
    // processor can import them directly via Turborepo's symlinked
    // workspace resolution. Keeping the renderers here (instead of a
    // dedicated `@school/budgeting-renderer` package) avoids duplicating
    // the puppeteer + exceljs deps across two workspaces.
    PdfRendererService,
    ExcelRendererService,
  ],
})
export class BudgetingModule {}
