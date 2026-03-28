// ─── DI Token ─────────────────────────────────────────────────────────────────

export const POD_TRANSPORT = Symbol('POD_TRANSPORT');

// ─── Types ────────────────────────────────────────────────────────────────────

/** Represents a single student record in PPOD format. */
export interface PodRecord {
  /** PPOD external student ID (e.g., roll number or PPOD reference) */
  external_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string; // ISO date
  gender: string;
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_county?: string;
  address_eircode?: string;
  nationality?: string;
  pps_number?: string;
  enrolment_date?: string; // ISO date
  year_group?: string;
  class_group?: string;
  leaving_date?: string; // ISO date
  leaving_reason_code?: string;
  [key: string]: string | undefined;
}

/** Error for a specific row/field during parsing or generation. */
export interface PodTransportError {
  row: number;
  field: string;
  message: string;
}

/** Result of a pull (parse) or push (generate) operation. */
export interface PodTransportResult {
  success: boolean;
  records: PodRecord[];
  errors: PodTransportError[];
  raw_content?: string;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface PodTransport {
  /** Parse input content (e.g., CSV from PPOD export) into structured records. */
  pull(content: string): Promise<PodTransportResult>;
  /** Convert structured records to export format (e.g., CSV for PPOD import). */
  push(records: PodRecord[]): Promise<PodTransportResult>;
}
