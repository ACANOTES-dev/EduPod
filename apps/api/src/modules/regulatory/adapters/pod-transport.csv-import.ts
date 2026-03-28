import { Injectable } from '@nestjs/common';

import type { PodRecord, PodTransport, PodTransportError, PodTransportResult } from './pod-transport.interface';

// ─── Header → PodRecord field mapping ─────────────────────────────────────────

const HEADER_TO_FIELD: Record<string, string> = {
  External_ID: 'external_id',
  First_Name: 'first_name',
  Last_Name: 'last_name',
  Date_of_Birth: 'date_of_birth',
  Gender: 'gender',
  Address_Line1: 'address_line1',
  Address_Line2: 'address_line2',
  Address_City: 'address_city',
  Address_County: 'address_county',
  Address_Eircode: 'address_eircode',
  Nationality: 'nationality',
  PPS_Number: 'pps_number',
  Enrolment_Date: 'enrolment_date',
  Year_Group: 'year_group',
  Class_Group: 'class_group',
  Leaving_Date: 'leaving_date',
  Leaving_Reason_Code: 'leaving_reason_code',
};

const REQUIRED_FIELDS: string[] = ['external_id', 'first_name', 'last_name'];

// ─── CSV Import Transport ─────────────────────────────────────────────────────

@Injectable()
export class CsvImportTransport implements PodTransport {
  async pull(content: string): Promise<PodTransportResult> {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return { success: false, records: [], errors: [{ row: 0, field: '', message: 'Empty file — no headers found' }] };
    }

    const headerLine = lines[0] ?? '';
    const headers = headerLine.split('\t').map((h) => h.trim());
    const fieldNames: string[] = headers.map((h) => HEADER_TO_FIELD[h] ?? h.toLowerCase().replace(/\s+/g, '_'));

    const records: PodRecord[] = [];
    const errors: PodTransportError[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const values = line.split('\t');
      const record: Record<string, string | undefined> = {};

      for (let j = 0; j < fieldNames.length; j++) {
        const fieldName = fieldNames[j];
        if (!fieldName) continue;

        const value = values[j]?.trim();
        record[fieldName] = value && value.length > 0 ? value : undefined;
      }

      // Validate required fields
      let hasError = false;
      for (const reqField of REQUIRED_FIELDS) {
        if (!record[reqField]) {
          errors.push({ row: i + 1, field: reqField, message: `Required field "${reqField}" is missing or empty` });
          hasError = true;
        }
      }

      if (!hasError) {
        records.push(record as PodRecord);
      }
    }

    return { success: errors.length === 0, records, errors };
  }

  async push(): Promise<PodTransportResult> {
    throw new Error('CSV import adapter does not support push');
  }
}
