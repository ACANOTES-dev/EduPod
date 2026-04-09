// ─── Report Cards Redesign — shared schemas barrel ──────────────────────────
// Single import surface for the report-cards module. Imported from the
// root @school/shared barrel and from API/web/worker code via that barrel.

export * from './content-scope.schema';
export * from './second-language.schema';
export * from './comment-window.schema';
export * from './subject-comment.schema';
export * from './overall-comment.schema';
export * from './teacher-request.schema';
export * from './tenant-settings.schema';
export * from './generation.schema';
