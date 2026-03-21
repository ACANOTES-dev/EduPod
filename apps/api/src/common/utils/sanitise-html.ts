/**
 * Server-side HTML sanitisation using isomorphic-dompurify.
 * Strips dangerous tags/attributes while preserving safe formatting and BiDi dir attributes.
 */

let sanitize: (dirty: string) => string;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const createDOMPurify = require('isomorphic-dompurify');
  const DOMPurify = createDOMPurify.default || createDOMPurify;

  sanitize = (dirty: string): string => {
    if (typeof DOMPurify.sanitize === 'function') {
      return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'img', 'hr',
          'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'sub', 'sup',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'dir', 'lang'],
        ALLOW_DATA_ATTR: false,
      });
    }
    return stripScripts(dirty);
  };
} catch {
  sanitize = stripScripts;
}

function stripScripts(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*(['"]?).*?\1/gi, '')
    .replace(/javascript:/gi, '');
}

export function sanitiseHtml(dirty: string): string {
  return sanitize(dirty);
}
