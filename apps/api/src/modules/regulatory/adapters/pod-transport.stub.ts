import { Injectable } from '@nestjs/common';

import type { PodRecord, PodTransport, PodTransportResult } from './pod-transport.interface';

// ─── Fixed test records returned by pull() ────────────────────────────────────

const STUB_RECORDS: PodRecord[] = [
  {
    external_id: 'STUB-001',
    first_name: 'Test',
    last_name: 'Student',
    date_of_birth: '2010-01-15',
    gender: 'male',
    nationality: 'Irish',
    enrolment_date: '2023-09-01',
    year_group: '1st Year',
    class_group: '1A',
  },
  {
    external_id: 'STUB-002',
    first_name: 'Sample',
    last_name: 'Pupil',
    date_of_birth: '2011-06-22',
    gender: 'female',
    nationality: 'Irish',
    enrolment_date: '2023-09-01',
    year_group: '1st Year',
    class_group: '1B',
  },
];

// ─── Stub Transport (test double) ─────────────────────────────────────────────

@Injectable()
export class StubTransport implements PodTransport {
  async pull(): Promise<PodTransportResult> {
    return { success: true, records: [...STUB_RECORDS], errors: [] };
  }

  async push(records: PodRecord[]): Promise<PodTransportResult> {
    return { success: true, records, errors: [] };
  }
}
