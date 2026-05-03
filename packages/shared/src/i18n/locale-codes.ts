import { z } from 'zod';

// Mirror the registry codes in apps/web/i18n/registry.ts exactly. We keep this
// file dependency-free so the shared package stays independent of frontend-only
// code (the registry pulls in additional metadata — direction, native name,
// active flag — that the backend doesn't need).
//
// When a new locale is added to the registry, add its code here in the same
// commit so backend Zod validation accepts it. Some registered locales may be
// inactive at runtime; tenant gating and the web registry decide what users can
// actually select.
export const REGISTERED_LOCALES = ['en', 'ar', 'ga', 'fr', 'de', 'es', 'it', 'ro', 'pl'] as const;

export type RegisteredLocale = (typeof REGISTERED_LOCALES)[number];

// Zod enum gives us a free-form-error message and `safeParse` ergonomics.
export const localeCodeSchema = z.enum(REGISTERED_LOCALES);

// supported_locales is a Postgres TEXT[] / VARCHAR(10)[] on the tenants table.
// Empty arrays are nonsensical (a tenant must serve at least one language) and
// duplicates would let two rows in the array refer to the same message file.
export const supportedLocalesSchema = z
  .array(localeCodeSchema)
  .min(1, 'At least one locale must be supported')
  .refine((arr) => new Set(arr).size === arr.length, 'Duplicate locale in supported_locales');

export const updateSupportedLocalesSchema = z
  .object({
    supported_locales: supportedLocalesSchema,
  })
  .strict();

// Patch payload for `PATCH /v1/households/:id/locale-preferences` (lands in
// implementation 06). Both fields are independently optional; secondary_locale
// is nullable so a household can clear its dual-language preference. `.strict()`
// rejects unknown fields so we never silently accept an undocumented column.
export const householdLocaleUpdateSchema = z
  .object({
    secondary_locale: localeCodeSchema.nullable().optional(),
    dual_language_opt_in: z.boolean().optional(),
  })
  .strict();

export type SupportedLocales = z.infer<typeof supportedLocalesSchema>;
export type UpdateSupportedLocales = z.infer<typeof updateSupportedLocalesSchema>;
export type HouseholdLocaleUpdate = z.infer<typeof householdLocaleUpdateSchema>;
