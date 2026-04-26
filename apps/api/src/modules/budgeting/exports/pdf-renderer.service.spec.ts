import { ServiceUnavailableException } from '@nestjs/common';

import { PdfRendererService } from './pdf-renderer.service';

// ─── puppeteer mock ──────────────────────────────────────────────────────
//
// PdfRendererService dynamically imports puppeteer and uses launch() →
// newPage() → setRequestInterception() → setContent() → pdf() → close().
// We mock the whole chain so the service can run without a Chromium
// binary.

const mockPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]); // PDF magic bytes

const mockRequest = (
  url: string,
): { url: () => string; continue: jest.Mock; abort: jest.Mock } => ({
  url: () => url,
  continue: jest.fn().mockResolvedValue(undefined),
  abort: jest.fn().mockResolvedValue(undefined),
});

const mockPage = {
  setRequestInterception: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  setContent: jest.fn().mockResolvedValue(undefined),
  pdf: jest.fn().mockResolvedValue(mockPdfBuffer),
};

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('puppeteer', () => ({
  default: {
    launch: jest.fn().mockImplementation(() => Promise.resolve(mockBrowser)),
  },
  __esModule: true,
}));

// ─── board-pack-template stub — keep test fast ────────────────────────────

jest.mock('./board-pack-template', () => ({
  buildBoardPackHtml: jest.fn().mockReturnValue('<!doctype html><html><body>stub</body></html>'),
}));

describe('PdfRendererService', () => {
  let service: PdfRendererService;

  // Minimal valid input — buildBoardPackHtml is mocked, so the actual
  // shape only matters for type-check.
  const input = {} as unknown as Parameters<PdfRendererService['renderBoardPackPdf']>[0];

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PdfRendererService();
  });

  it('renders the board pack PDF and returns a Buffer of the byte stream', async () => {
    const result = await service.renderBoardPackPdf(input);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.equals(mockPdfBuffer)).toBe(true);
    expect(mockBrowser.newPage).toHaveBeenCalledTimes(1);
    expect(mockPage.setContent).toHaveBeenCalledWith(
      expect.stringContaining('<!doctype html>'),
      expect.objectContaining({ waitUntil: 'networkidle0' }),
    );
    expect(mockPage.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
      }),
    );
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it('blocks non-data, non-about external requests via request interception', async () => {
    await service.renderBoardPackPdf(input);
    // Verify the request listener was registered.
    expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
    expect(mockPage.on).toHaveBeenCalledWith('request', expect.any(Function));

    // Pluck the listener and exercise it against three URL shapes.
    const onCall = mockPage.on.mock.calls.find((c) => c[0] === 'request');
    if (!onCall) throw new Error('No request listener registered');
    const listener = onCall[1] as (req: ReturnType<typeof mockRequest>) => void;

    const httpsReq = mockRequest('https://attacker.example/escape.png');
    listener(httpsReq);
    expect(httpsReq.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(httpsReq.continue).not.toHaveBeenCalled();

    const dataReq = mockRequest('data:image/png;base64,iVBORw0KGgoAAAA');
    listener(dataReq);
    expect(dataReq.continue).toHaveBeenCalledTimes(1);
    expect(dataReq.abort).not.toHaveBeenCalled();

    const aboutReq = mockRequest('about:blank');
    listener(aboutReq);
    expect(aboutReq.continue).toHaveBeenCalledTimes(1);
  });

  it('throws ServiceUnavailableException with a structured code on render failure and still closes the browser', async () => {
    mockPage.setContent.mockRejectedValueOnce(new Error('Navigation timeout'));
    await expect(service.renderBoardPackPdf(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    try {
      await service.renderBoardPackPdf(input);
    } catch (err) {
      const response = (err as ServiceUnavailableException).getResponse() as {
        code: string;
        message: string;
      };
      expect(response.code).toBe('BOARD_PACK_PDF_RENDER_FAILED');
    }
    // Browser must close even on failure.
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
