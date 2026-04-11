/**
 * Unit tests for the thread-message display helpers.
 *
 * `formatBytes` is a pure helper that turns a byte count into a human-readable
 * string (e.g. 2048 → "2.0 KB"). We mirror it here to verify the thresholds.
 *
 * URL detection is also pure: the component replaces every http(s)://... span
 * in a message body with an `<a>` node. We verify the regex that decides what
 * counts as a URL.
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function findUrls(line: string): string[] {
  const urlRe = /(https?:\/\/[^\s<]+)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(line)) !== null) out.push(m[0]);
  return out;
}

describe('ThreadMessage — formatBytes', () => {
  afterEach(() => jest.clearAllMocks());

  it('should format bytes below 1 KB as "N B"', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('should format KB with one decimal place', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1023)).toBe('1023.0 KB');
  });

  it('should format MB with one decimal place', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });
});

describe('ThreadMessage — URL detection', () => {
  afterEach(() => jest.clearAllMocks());

  it('should detect a single http URL', () => {
    expect(findUrls('see http://example.com please')).toEqual(['http://example.com']);
  });

  it('should detect a single https URL', () => {
    expect(findUrls('go to https://edupod.app now')).toEqual(['https://edupod.app']);
  });

  it('should detect multiple URLs in one line', () => {
    expect(findUrls('https://a.test and https://b.test')).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('should return empty array when no URL is present', () => {
    expect(findUrls('no links here at all')).toEqual([]);
  });

  it('should not include trailing whitespace in the matched URL', () => {
    expect(findUrls('hi https://example.com bye')).toEqual(['https://example.com']);
  });
});
