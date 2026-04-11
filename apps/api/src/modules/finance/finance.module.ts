import { forwardRef, Module, type OnModuleInit } from '@nestjs/common';

import { AdmissionsModule } from '../admissions/admissions.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { AudienceProviderRegistry } from '../inbox/audience/audience-provider.registry';
import { InboxModule } from '../inbox/inbox.module';
import { ParentsModule } from '../parents/parents.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { RbacModule } from '../rbac/rbac.module';
import { SequenceModule } from '../sequence/sequence.module';
import { TenantsModule } from '../tenants/tenants.module';

import { FeesInArrearsProvider } from './audience/fees-in-arrears.provider';
import { BulkOperationsService } from './bulk-operations.service';
import { CreditNotesService } from './credit-notes.service';
import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';
import { FeeAssignmentsController } from './fee-assignments.controller';
import { FeeAssignmentsService } from './fee-assignments.service';
import { FeeGenerationController } from './fee-generation.controller';
import { FeeGenerationService } from './fee-generation.service';
import { FeeStructuresController } from './fee-structures.controller';
import { FeeStructuresService } from './fee-structures.service';
import { FinanceAuditService } from './finance-audit.service';
import { FinanceDashboardController } from './finance-dashboard.controller';
import { FinanceDashboardService } from './finance-dashboard.service';
import { FinanceEnhancedController } from './finance-enhanced.controller';
import { FinanceReadFacade } from './finance-read.facade';
import { FinancialReportsService } from './financial-reports.service';
import { HouseholdStatementsController } from './household-statements.controller';
import { HouseholdStatementsService } from './household-statements.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { LateFeesService } from './late-fees.service';
import { ParentFinanceController } from './parent-finance.controller';
import { PaymentPlansService } from './payment-plans.service';
import { PaymentRemindersService } from './payment-reminders.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ReceiptsService } from './receipts.service';
import { RecurringInvoicesService } from './recurring-invoices.service';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { ScholarshipsService } from './scholarships.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';

@Module({
  imports: [
    forwardRef(() => AdmissionsModule),
    ApprovalsModule,
    AuditLogModule,
    ConfigurationModule,
    InboxModule,
    ParentsModule,
    PdfRenderingModule,
    RbacModule,
    SequenceModule,
    TenantsModule,
  ],
  controllers: [
    FeeStructuresController,
    DiscountsController,
    FeeAssignmentsController,
    InvoicesController,
    FeeGenerationController,
    PaymentsController,
    RefundsController,
    StripeWebhookController,
    HouseholdStatementsController,
    FinanceDashboardController,
    FinanceEnhancedController,
    ParentFinanceController,
  ],
  providers: [
    FeeStructuresService,
    DiscountsService,
    FeeAssignmentsService,
    InvoicesService,
    FeeGenerationService,
    PaymentsService,
    ReceiptsService,
    RefundsService,
    StripeService,
    HouseholdStatementsService,
    FinanceDashboardService,
    CreditNotesService,
    LateFeesService,
    ScholarshipsService,
    PaymentRemindersService,
    RecurringInvoicesService,
    FinancialReportsService,
    PaymentPlansService,
    FinanceAuditService,
    BulkOperationsService,
    FinanceReadFacade,
    FeesInArrearsProvider,
  ],
  exports: [
    InvoicesService,
    PaymentsService,
    ReceiptsService,
    ScholarshipsService,
    PaymentRemindersService,
    RecurringInvoicesService,
    LateFeesService,
    FinanceReadFacade,
    StripeService,
    FeesInArrearsProvider,
  ],
})
export class FinanceModule implements OnModuleInit {
  constructor(
    private readonly registry: AudienceProviderRegistry,
    private readonly feesInArrears: FeesInArrearsProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.feesInArrears);
  }
}
