import type { ExportInput } from '../report-export.types';

import { PdfRenderer } from './pdf-renderer';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

// Capture what gets passed into puppeteer so we can assert on the HTML + PDF
// options without spinning up a headless Chromium in test.
const capturedHtml: { value: string } = { value: '' };
const capturedPdfOptions: { value: Record<string, unknown> } = { value: {} };

const mockPage = {
  setRequestInterception: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  setContent: jest.fn().mockImplementation(async (html: string) => {
    capturedHtml.value = html;
  }),
  pdf: jest.fn().mockImplementation(async (opts: Record<string, unknown>) => {
    capturedPdfOptions.value = opts;
    return Buffer.from('%PDF-1.4\nfake-pdf-contents');
  }),
  close: jest.fn().mockResolvedValue(undefined),
};
const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(undefined),
};
jest.mock(
  'puppeteer',
  () => ({
    __esModule: true,
    default: {
      launch: jest.fn().mockImplementation(async () => mockBrowser),
    },
  }),
  { virtual: false },
);

function makeInput(overrides: Partial<ExportInput> = {}): ExportInput {
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
      ],
      rows: [
        { student: 'Alice', rate: 94 },
        { student: 'Bashir', rate: 82 },
      ],
    },
    branding: {
      tenant_id: TENANT_ID,
      school_name: 'NHQS Academy',
      logo_url: null,
      primary_color: '#1d4ed8',
      secondary_color: '#64748b',
      locale: 'en',
      currency_code: 'EUR',
    },
    ...overrides,
  };
}

describe('PdfRenderer', () => {
  let renderer: PdfRenderer;

  beforeEach(() => {
    renderer = new PdfRenderer();
    jest.clearAllMocks();
    capturedHtml.value = '';
    capturedPdfOptions.value = {};
  });

  it('returns a PDF-signature buffer and sets A4 landscape when > 6 columns', async () => {
    const buffer = await renderer.render(
      makeInput({
        data: {
          columns: Array.from({ length: 7 }, (_, idx) => ({
            id: `c${idx}`,
            label: `Col ${idx}`,
            type: 'string',
          })),
          rows: [{ c0: 'a', c1: 'b', c2: 'c', c3: 'd', c4: 'e', c5: 'f', c6: 'g' }],
        },
      }),
    );

    expect(Buffer.from(buffer.subarray(0, 4)).toString('ascii')).toBe('%PDF');
    expect(capturedPdfOptions.value.landscape).toBe(true);
    expect(capturedPdfOptions.value.format).toBe('A4');
  });

  it('defaults to portrait when <= 6 columns', async () => {
    await renderer.render(makeInput());
    expect(capturedPdfOptions.value.landscape).toBe(false);
  });

  it('renders HTML with dir="rtl" when the tenant locale is Arabic', async () => {
    await renderer.render(
      makeInput({
        branding: {
          tenant_id: TENANT_ID,
          school_name: 'المدرسة',
          logo_url: null,
          primary_color: '#1d4ed8',
          secondary_color: '#64748b',
          locale: 'ar',
          currency_code: 'AED',
        },
      }),
    );
    expect(capturedHtml.value).toContain('dir="rtl"');
    expect(capturedHtml.value).toContain('المدرسة');
  });

  it('embeds the report name, school name, and each column header', async () => {
    await renderer.render(makeInput());
    expect(capturedHtml.value).toContain('Sample Student Export');
    expect(capturedHtml.value).toContain('NHQS Academy');
    expect(capturedHtml.value).toContain('<th scope="col">Student</th>');
    expect(capturedHtml.value).toContain('<th scope="col">Attendance</th>');
  });
});
