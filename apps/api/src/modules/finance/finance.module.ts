import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { TenantsModule } from '../tenants/tenants.module';

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
    ApprovalsModule,
    TenantsModule,
    ConfigurationModule,
    PdfRenderingModule,
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
  ],
  exports: [
    InvoicesService,
    PaymentsService,
    ReceiptsService,
    ScholarshipsService,
    PaymentRemindersService,
    RecurringInvoicesService,
    LateFeesService,
  ],
})
export class FinanceModule {}
