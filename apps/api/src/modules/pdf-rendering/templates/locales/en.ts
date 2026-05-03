import { renderDesInspectionEn } from '../des-inspection-en.template';
import { renderHouseholdStatementEn } from '../household-statement-en.template';
import { renderInvoiceEn } from '../invoice-en.template';
import { renderPastoralSummaryEn } from '../pastoral-summary-en.template';
import { renderPayslipEn } from '../payslip-en.template';
import { renderReceiptEn } from '../receipt-en.template';
import { renderReportCardEn } from '../report-card-en.template';
import { renderReportCardModernEn } from '../report-card-modern-en.template';
import { renderSafeguardingComplianceEn } from '../safeguarding-compliance-en.template';
import { renderSstActivityEn } from '../sst-activity-en.template';
import { renderTranscriptEn } from '../transcript-en.template';
import { renderTripLeaderPackEn } from '../trip-leader-pack-en.template';
import { renderWellbeingProgrammeEn } from '../wellbeing-programme-en.template';

import type { PdfTemplateBundle } from './types';

export const englishPdfTemplates: PdfTemplateBundle = {
  'des-inspection': renderDesInspectionEn,
  'household-statement': renderHouseholdStatementEn,
  invoice: renderInvoiceEn,
  'pastoral-summary': renderPastoralSummaryEn,
  payslip: renderPayslipEn,
  receipt: renderReceiptEn,
  'report-card': renderReportCardEn,
  'report-card-modern': renderReportCardModernEn,
  'safeguarding-compliance': renderSafeguardingComplianceEn,
  'sst-activity': renderSstActivityEn,
  transcript: renderTranscriptEn,
  'trip-leader-pack': renderTripLeaderPackEn,
  'wellbeing-programme': renderWellbeingProgrammeEn,
};
