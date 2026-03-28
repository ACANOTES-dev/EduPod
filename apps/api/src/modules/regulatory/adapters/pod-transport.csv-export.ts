import { Injectable } from '@nestjs/common';

import type { PodRecord, PodTransport, PodTransportError, PodTransportResult } from './pod-transport.interface';

// ─── Column ordering (consistent with import format) ──────────────────────────

const COLUMNS: Array<{ header: string; field: string }> = [
  { header: 'External_ID', field: 'external_id' },
  { header: 'First_Name', field: 'first_name' },
  { header: 'Last_Name', field: 'last_name' },
  { header: 'Date_of_Birth', field: 'date_of_birth' },
  { header: 'Gender', field: 'gender' },
  { header: 'Address_Line1', field: 'address_line1' },
  { header: 'Address_Line2', field: 'address_line2' },
  { header: 'Address_City', field: 'address_city' },
  { header: 'Address_County', field: 'address_county' },
  { header: 'Address_Eircode', field: 'address_eircode' },
  { header: 'Nationality', field: 'nationality' },
  { header: 'PPS_Number', field: 'pps_number' },
  { header: 'Enrolment_Date', field: 'enrolment_date' },
  { header: 'Year_Group', field: 'year_group' },
  { header: 'Class_Group', field: 'class_group' },
  { header: 'Leaving_Date', field: 'leaving_date' },
  { header: 'Leaving_Reason_Code', field: 'leaving_reason_code' },
];

const REQUIRED_FIELDS: string[] = ['external_id', 'first_name', 'last_name'];

// ─── CSV Export Transport ─────────────────────────────────────────────────────

@Injectable()
export class CsvExportTransport implements PodTransport {
  async pull(): Promise<PodTransportResult> {
    throw new Error('CSV export adapter does not support pull');
  }

  async push(records: PodRecord[]): Promise<PodTransportResult> {
    const errors: PodTransportError[] = [];
    const validRecords: PodRecord[] = [];

    // Validate required fields per record
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record) continue;

      let hasError = false;

      for (const field of REQUIRED_FIELDS) {
        if (!record[field]) {
          errors.push({ row: i + 1, field, message: `Required field "${field}" is missing or empty` });
          hasError = true;
        }
      }

      if (!hasError) {
        validRecords.push(record);
      }
    }

    // Build tab-delimited CSV
    const headerRow = COLUMNS.map((col) => col.header).join('\t');
    const dataRows = validRecords.map((record) =>
      COLUMNS.map((col) => record[col.field] ?? '').join('\t'),
    );
    const csvString = [headerRow, ...dataRows].join('\r\n');

    return {
      success: errors.length === 0,
      records: validRecords,
      errors,
      raw_content: csvString,
    };
  }
}
