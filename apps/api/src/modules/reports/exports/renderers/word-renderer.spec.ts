import AdmZip from 'adm-zip';

import type { ExportInput } from '../report-export.types';

import { WordRenderer } from './word-renderer';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function makeInput(locale: 'en' | 'ar' = 'en'): ExportInput {
  return {
    tenantId: TENANT_ID,
    report: {
      name: 'Sample Student Export',
      description: 'Demographic snapshot',
      filters_summary: 'Year 10 · this term',
      generated_by: 'owner@nhqs.test',
      generated_at: new Date('2026-04-24T09:00:00Z'),
    },
    data: {
      columns: [
        { id: 'student', label: 'Student', type: 'string' },
        { id: 'rate', label: 'Attendance', type: 'number' },
        { id: 'paid', label: 'Fees paid', type: 'currency' },
        { id: 'last_seen', label: 'Last seen', type: 'date' },
        { id: 'at_risk', label: 'At risk', type: 'boolean' },
      ],
      rows: [
        {
          student: 'Alice',
          rate: 94,
          paid: 1200.5,
          last_seen: new Date('2026-04-22T00:00:00Z'),
          at_risk: false,
        },
      ],
    },
    branding: {
      tenant_id: TENANT_ID,
      school_name: locale === 'ar' ? 'المدرسة' : 'NHQS Academy',
      logo_url: null,
      primary_color: '#1d4ed8',
      secondary_color: '#64748b',
      locale,
      currency_code: 'EUR',
    },
  };
}

describe('WordRenderer', () => {
  const renderer = new WordRenderer();

  it('produces a valid docx (ZIP) buffer over 1 KB', async () => {
    const buffer = await renderer.render(makeInput());
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1024);
    expect(Buffer.from(buffer.subarray(0, 2)).toString('ascii')).toBe('PK');
  });

  it('embeds the report name, school name, and column headers in the document body', async () => {
    const buffer = await renderer.render(makeInput());
    // Decompress the docx (zip) and pull `word/document.xml` to assert the
    // title and each column header made it into the rendered body.
    const zip = new AdmZip(buffer);
    const docXmlEntry = zip.getEntry('word/document.xml');
    expect(docXmlEntry).not.toBeNull();
    const docXml = docXmlEntry!.getData().toString('utf8');
    expect(docXml).toContain('Sample Student Export');
    expect(docXml).toContain('NHQS Academy');
    expect(docXml).toContain('Student');
    expect(docXml).toContain('Last seen');
  });

  it('renders without throwing when the tenant locale is Arabic', async () => {
    const buffer = await renderer.render(makeInput('ar'));
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1024);
  });
});
