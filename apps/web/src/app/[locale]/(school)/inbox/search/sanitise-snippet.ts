/**
 * Sanitise a snippet emitted by PostgreSQL's `ts_headline`. Only
 * `<mark>` / `</mark>` survive; everything else is HTML-entity
 * escaped so arbitrary message content cannot inject markup when
 * the snippet is `dangerouslySetInnerHTML`'d into the page.
 *
 * Lives in its own file (rather than `page.tsx`) because Next.js
 * route-page files can only export `default` and a whitelist of
 * config fields — additional named exports crash the build.
 */
export function sanitiseSnippet(input: string): string {
  const escaped = input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped.replace(/&lt;mark&gt;/g, '<mark>').replace(/&lt;\/mark&gt;/g, '</mark>');
}
