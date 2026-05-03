import { renderDesInspectionAr } from '../des-inspection-ar.template';
import { renderHouseholdStatementAr } from '../household-statement-ar.template';
import { renderInvoiceAr } from '../invoice-ar.template';
import { renderPastoralSummaryAr } from '../pastoral-summary-ar.template';
import { renderPayslipAr } from '../payslip-ar.template';
import { renderReceiptAr } from '../receipt-ar.template';
import { renderReportCardAr } from '../report-card-ar.template';
import { renderReportCardModernAr } from '../report-card-modern-ar.template';
import { renderSafeguardingComplianceAr } from '../safeguarding-compliance-ar.template';
import { renderSstActivityAr } from '../sst-activity-ar.template';
import { renderTranscriptAr } from '../transcript-ar.template';
import { renderTripLeaderPackAr } from '../trip-leader-pack-ar.template';
import { renderWellbeingProgrammeAr } from '../wellbeing-programme-ar.template';

import type { PdfTemplateBundle } from './types';

export const arabicPdfTemplates: PdfTemplateBundle = {
  'des-inspection': renderDesInspectionAr,
  'household-statement': renderHouseholdStatementAr,
  invoice: renderInvoiceAr,
  'pastoral-summary': renderPastoralSummaryAr,
  payslip: renderPayslipAr,
  receipt: renderReceiptAr,
  'report-card': renderReportCardAr,
  'report-card-modern': renderReportCardModernAr,
  'safeguarding-compliance': renderSafeguardingComplianceAr,
  'sst-activity': renderSstActivityAr,
  transcript: renderTranscriptAr,
  'trip-leader-pack': renderTripLeaderPackAr,
  'wellbeing-programme': renderWellbeingProgrammeAr,
};
