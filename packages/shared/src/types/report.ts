export interface PromotionRolloverReport {
  promoted: number;
  held_back: number;
  graduated: number;
  withdrawn: number;
  details: PromotionDetail[];
}

export interface PromotionDetail {
  year_group_id: string;
  year_group_name: string;
  promoted: number;
  held_back: number;
  graduated: number;
}

export interface FeeGenerationRunSummary {
  id: string;
  run_date: string;
  invoices_created: number;
  total_amount: number;
  households_affected: number;
  metadata: Record<string, unknown>;
}

export interface WriteOffEntry {
  invoice_id: string;
  invoice_number: string;
  household_name: string;
  amount: number;
  written_off_at: string;
  reason: string | null;
}

export interface WriteOffReport {
  entries: WriteOffEntry[];
  totals: {
    total_written_off: number;
    total_discounts: number;
  };
}

export interface NotificationDeliverySummary {
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  by_channel: Array<{
    channel: string;
    sent: number;
    delivered: number;
    failed: number;
    delivery_rate: number;
  }>;
  by_template: Array<{
    template_key: string;
    sent: number;
    delivered: number;
    failed: number;
  }>;
  failure_reasons: Array<{
    reason: string;
    count: number;
  }>;
}

export interface ExportPackItem {
  section: string;
  data: unknown[];
}

export interface ExportPack {
  subject_type: string;
  subject_id: string;
  exported_at: string;
  sections: ExportPackItem[];
}
