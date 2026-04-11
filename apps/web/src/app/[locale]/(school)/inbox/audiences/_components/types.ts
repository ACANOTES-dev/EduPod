import type { AudienceDefinition, AudienceProviderKey } from '@school/shared/inbox';

export interface SavedAudienceRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  kind: 'static' | 'dynamic';
  definition_json: unknown;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface AudiencePreviewResult {
  count: number;
  sample: Array<{ user_id: string; display_name: string }>;
}

export interface AudienceResolutionResult {
  user_ids: string[];
  resolved_at: string;
  definition: AudienceDefinition;
}

export interface ProviderInfo {
  key: AudienceProviderKey;
  display_name: string;
  wired: boolean;
}

export interface StaticDefinition {
  user_ids: string[];
}

export function isStaticDefinition(def: unknown): def is StaticDefinition {
  return (
    typeof def === 'object' &&
    def !== null &&
    'user_ids' in def &&
    Array.isArray((def as StaticDefinition).user_ids)
  );
}

export function isDynamicDefinition(def: unknown): def is AudienceDefinition {
  return (
    typeof def === 'object' &&
    def !== null &&
    ('provider' in (def as Record<string, unknown>) ||
      'operator' in (def as Record<string, unknown>))
  );
}
