export type ImportType = 'students' | 'parents' | 'staff' | 'fees' | 'exam_results' | 'staff_compensation';
export type ImportStatus = 'uploaded' | 'validated' | 'processing' | 'completed' | 'failed';

export interface ImportSummary {
  total_rows: number;
  successful: number;
  failed: number;
  warnings: number;
  errors: Array<{ row: number; field: string; error: string }>;
  warnings_list: Array<{ row: number; field: string; warning: string }>;
}

export interface ImportJob {
  id: string;
  tenant_id: string;
  import_type: ImportType;
  file_key: string | null;
  status: ImportStatus;
  summary_json: ImportSummary;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}
