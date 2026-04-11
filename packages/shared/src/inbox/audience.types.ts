/**
 * Audience provider registry and composition types for the smart audience
 * engine. The actual resolvers live in
 * `apps/api/src/modules/inbox/audience/providers/*.provider.ts`.
 *
 * These types are exposed here so the frontend audience builder and any
 * consumer of a broadcast's stored `definition_json` can speak the same shape.
 */

export const AUDIENCE_PROVIDER_KEYS = [
  'school',
  'parents_school',
  'staff_all',
  'staff_role',
  'department',
  'year_group_parents',
  'class_parents',
  'section_parents',
  'household',
  'year_group_students',
  'class_students',
  'handpicked',
  'fees_in_arrears',
  'event_attendees',
  'trip_roster',
  'saved_group',
] as const;
export type AudienceProviderKey = (typeof AUDIENCE_PROVIDER_KEYS)[number];

/** A single-provider audience leaf. */
export interface AudienceLeaf {
  provider: AudienceProviderKey;
  params?: Record<string, unknown>;
}

/** AND/OR operator node with two or more operands. */
export interface AudienceAndNode {
  operator: 'and';
  operands: AudienceDefinition[];
}

export interface AudienceOrNode {
  operator: 'or';
  operands: AudienceDefinition[];
}

/** NOT operator with a single operand. */
export interface AudienceNotNode {
  operator: 'not';
  operand: AudienceDefinition;
}

/** A composed audience definition — leaf, and/or, or not. */
export type AudienceDefinition = AudienceLeaf | AudienceAndNode | AudienceOrNode | AudienceNotNode;

export function isAudienceLeaf(def: AudienceDefinition): def is AudienceLeaf {
  return 'provider' in def;
}

export function isAudienceAndNode(def: AudienceDefinition): def is AudienceAndNode {
  return 'operator' in def && def.operator === 'and';
}

export function isAudienceOrNode(def: AudienceDefinition): def is AudienceOrNode {
  return 'operator' in def && def.operator === 'or';
}

export function isAudienceNotNode(def: AudienceDefinition): def is AudienceNotNode {
  return 'operator' in def && def.operator === 'not';
}
