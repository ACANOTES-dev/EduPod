import type { ReportCardRenderPayload } from '@school/shared';

import {
  DEFAULT_DESIGN_KEY,
  ProductionReportCardRenderer,
  type PuppeteerLauncher,
  type TemplateDesignResolver,
} from './report-card-production.renderer';

// ─── Fake puppeteer ──────────────────────────────────────────────────────────
// We don't launch a real Chromium in unit tests. Instead a minimal fake
// captures the HTML that `setContent` receives and returns a sentinel buffer.

function buildFakeLauncher() {
  const setContent = jest.fn<Promise<void>, [string, unknown]>().mockResolvedValue(undefined);
  const pdf = jest
    .fn<Promise<Uint8Array>, [unknown]>()
    .mockResolvedValue(Uint8Array.from(Buffer.from('%PDF-1.4\n%%EOF', 'latin1')));
  const close = jest.fn().mockResolvedValue(undefined);
  const pageClose = jest.fn().mockResolvedValue(undefined);

  const page = { setContent, pdf, close: pageClose } as const;
  const newPage = jest.fn().mockResolvedValue(page);
  const browser = { newPage, close } as const;

  const launch = jest.fn<Promise<typeof browser>, []>().mockResolvedValue(browser);
  const launcher: PuppeteerLauncher = { launch };

  return { launcher, launch, setContent, pdf, close, pageClose, newPage };
}

function buildFakeDesignResolver(designKey: string | null = null): TemplateDesignResolver {
  return {
    resolveDesignKey: jest.fn().mockResolvedValue(designKey),
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function basePayload(overrides: Partial<ReportCardRenderPayload> = {}): ReportCardRenderPayload {
  return {
    tenant: {
      id: 't-1',
      name: 'Nurul Huda Language School',
      logo_storage_key: null,
      principal_name: 'Mr John Doe',
      principal_signature_storage_key: null,
      address: null,
    },
    language: 'en',
    direction: 'ltr',
    template: { id: 'tpl-1', content_scope: 'grades_only' },
    student: {
      id: 's-1',
      personal_info: {
        full_name: 'Clark Mitchell',
        student_number: 'NHL-2024-0147',
        year_group: 'Second Class',
        class_name: '2A',
      },
      rank_badge: null,
    },
    academic_period: {
      id: 'ap-1',
      name: 'Semester 1',
      academic_year_name: '2025-2026',
    },
    grades: {
      subjects: [
        {
          subject_id: 'sub-1',
          subject_name: 'Mathematics',
          teacher_name: null,
          score: 92,
          grade: 'A',
          subject_comment: 'Strong numerical reasoning.',
        },
        {
          subject_id: 'sub-2',
          subject_name: 'Geography',
          teacher_name: null,
          score: 91,
          grade: 'A',
          subject_comment: 'Excellent project work.',
        },
      ],
      overall: {
        weighted_average: 91.5,
        overall_grade: 'A',
        overall_comment: 'A standout semester.',
      },
      grading_scale: [
        { label: 'A', min: 90, max: 100 },
        { label: 'B', min: 80, max: 89 },
      ],
    },
    issued_at: '2026-04-09T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProductionReportCardRenderer — design resolution', () => {
  afterEach(() => jest.clearAllMocks());

  it('falls back to the default design when resolver returns null', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver(null);
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    const buffer = await renderer.render(basePayload());

    expect(resolver.resolveDesignKey).toHaveBeenCalledWith('tpl-1');
    expect(buffer.length).toBeGreaterThan(0);
    expect(setContent).toHaveBeenCalledTimes(1);

    const html = setContent.mock.calls[0]?.[0] ?? '';
    // Editorial Academic is the default — contains the Fraunces font link
    expect(html).toContain('family=Fraunces');
    // And does NOT contain the Modern Editorial watermark style
    expect(html).not.toContain('family=Bricolage');
  });

  it('falls back to the default when resolver returns an unknown key', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('some-other-design');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await renderer.render(basePayload());

    const html = setContent.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('family=Fraunces');
  });

  it('uses modern-editorial when resolver returns that key', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('modern-editorial');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await renderer.render(basePayload());

    const html = setContent.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('family=Bricolage+Grotesque');
    expect(html).toContain('--cobalt:');
  });

  it('edge: tolerates resolver throwing', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver: TemplateDesignResolver = {
      resolveDesignKey: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await expect(renderer.render(basePayload())).resolves.toBeInstanceOf(Buffer);
    // Should still have rendered via the fallback design
    expect(setContent).toHaveBeenCalledTimes(1);
  });

  it('exports DEFAULT_DESIGN_KEY as a stable constant', () => {
    expect(DEFAULT_DESIGN_KEY).toBe('editorial-academic');
  });
});

describe('ProductionReportCardRenderer — rendered HTML content', () => {
  afterEach(() => jest.clearAllMocks());

  it('embeds the student name, tenant name and subject list', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await renderer.render(basePayload());

    const html = setContent.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('Clark Mitchell');
    expect(html).toContain('Nurul Huda Language School');
    expect(html).toContain('Mathematics');
    expect(html).toContain('Geography');
    expect(html).toContain('92.0%');
    expect(html).toContain('91.0%');
    // Overall average + grade
    expect(html).toContain('91.5%');
  });

  it('renders the rank badge label only when top-3', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    const payload = basePayload();
    payload.student.rank_badge = 2;
    await renderer.render(payload);

    expect(setContent.mock.calls[0]?.[0]).toContain('2nd in class');
  });

  it('does not render rank badge markup when rank_badge is null', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await renderer.render(basePayload());
    const html = setContent.mock.calls[0]?.[0] ?? '';
    expect(html).not.toMatch(/Top of class|2nd in class|3rd in class/);
  });

  it('renders Arabic direction and translated strings for ar payloads', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    const payload = basePayload({ language: 'ar', direction: 'rtl' });
    payload.student.personal_info.full_name = 'كلارك ميتشل';
    await renderer.render(payload);

    const html = setContent.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('النتائج الأكاديمية');
    expect(html).toContain('الأداء العام');
    expect(html).toContain('كلارك ميتشل');
  });

  it('edge: renders successfully with empty subject list', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    const payload = basePayload();
    payload.grades.subjects = [];
    await expect(renderer.render(payload)).resolves.toBeInstanceOf(Buffer);
    const html = setContent.mock.calls[0]?.[0] ?? '';
    expect(html).not.toContain('<tbody></tbody>'); // either a message or the table is omitted
  });

  it('edge: handles 12 subjects (overflow scenario) without error', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    const payload = basePayload();
    payload.grades.subjects = Array.from({ length: 12 }, (_, i) => ({
      subject_id: `sub-${i}`,
      subject_name: `Subject ${i + 1}`,
      teacher_name: null,
      score: 70 + i,
      grade: 'B',
      subject_comment: `Comment ${i + 1}`,
    }));

    await expect(renderer.render(payload)).resolves.toBeInstanceOf(Buffer);
    const html = setContent.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('Subject 1');
    expect(html).toContain('Subject 12');
  });

  it('edge: missing principal signature renders a signature line instead of image', async () => {
    const { launcher, setContent } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await renderer.render(basePayload());
    const html = setContent.mock.calls[0]?.[0] ?? '';
    expect(html).toContain('signature-line');
    // No signature-image tag
    expect(html).not.toMatch(/<img\s+class="signature-image"/);
  });
});

describe('ProductionReportCardRenderer — browser lifecycle', () => {
  afterEach(() => jest.clearAllMocks());

  it('reuses the same browser across multiple render calls', async () => {
    const { launcher, launch, newPage } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await renderer.render(basePayload());
    await renderer.render(basePayload());

    expect(launch).toHaveBeenCalledTimes(1);
    expect(newPage).toHaveBeenCalledTimes(2);
  });

  it('closes the browser on module destroy', async () => {
    const { launcher, close } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await renderer.render(basePayload());
    await renderer.onModuleDestroy();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy is a no-op when no browser was launched', async () => {
    const { launcher, close } = buildFakeLauncher();
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await renderer.onModuleDestroy();
    expect(close).not.toHaveBeenCalled();
  });

  it('closes the page even when pdf() throws', async () => {
    const { launcher, pdf, pageClose } = buildFakeLauncher();
    pdf.mockRejectedValueOnce(new Error('render timeout'));
    const resolver = buildFakeDesignResolver('editorial-academic');
    const renderer = new ProductionReportCardRenderer(launcher, resolver);

    await expect(renderer.render(basePayload())).rejects.toThrow('render timeout');
    expect(pageClose).toHaveBeenCalled();
  });
});
