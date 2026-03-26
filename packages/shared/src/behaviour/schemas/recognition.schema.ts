import { z } from 'zod';

// ─── Award Types ────────────────────────────────────────────────────────────

export const REPEAT_MODE = ['once_ever', 'once_per_year', 'once_per_period', 'unlimited'] as const;
export type RepeatMode = (typeof REPEAT_MODE)[number];

export const createAwardTypeSchema = z.object({
  name: z.string().min(1).max(100),
  name_ar: z.string().max(100).nullable().optional(),
  description: z.string().nullable().optional(),
  points_threshold: z.number().int().min(1).nullable().optional(),
  repeat_mode: z.enum(REPEAT_MODE).default('once_per_year'),
  repeat_max_per_year: z.number().int().min(1).nullable().optional(),
  tier_group: z.string().max(50).nullable().optional(),
  tier_level: z.number().int().min(1).nullable().optional(),
  supersedes_lower_tiers: z.boolean().default(false),
  icon: z.string().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  display_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export type CreateAwardTypeDto = z.infer<typeof createAwardTypeSchema>;

export const updateAwardTypeSchema = createAwardTypeSchema.partial();
export type UpdateAwardTypeDto = z.infer<typeof updateAwardTypeSchema>;

// ─── Manual Award ───────────────────────────────────────────────────────────

export const createManualAwardSchema = z.object({
  student_id: z.string().uuid(),
  award_type_id: z.string().uuid(),
  notes: z.string().nullable().optional(),
});

export type CreateManualAwardDto = z.infer<typeof createManualAwardSchema>;

export const listAwardsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  award_type_id: z.string().uuid().optional(),
  academic_year_id: z.string().uuid().optional(),
});

export type ListAwardsQuery = z.infer<typeof listAwardsQuerySchema>;

// ─── Publication Approvals ──────────────────────────────────────────────────

export const PUBLICATION_TYPE = [
  'recognition_wall_website',
  'house_leaderboard_website',
  'individual_achievement_website',
] as const;
export type PublicationTypeValue = (typeof PUBLICATION_TYPE)[number];

export const PUBLICATION_ENTITY_TYPE = ['incident', 'award'] as const;
export type PublicationEntityTypeValue = (typeof PUBLICATION_ENTITY_TYPE)[number];

export const createPublicationSchema = z.object({
  publication_type: z.enum(PUBLICATION_TYPE),
  entity_type: z.enum(PUBLICATION_ENTITY_TYPE),
  entity_id: z.string().uuid(),
  student_id: z.string().uuid(),
});

export type CreatePublicationDto = z.infer<typeof createPublicationSchema>;

export const approvePublicationSchema = z.object({
  note: z.string().optional(),
});

export type ApprovePublicationDto = z.infer<typeof approvePublicationSchema>;

// ─── Recognition Wall ───────────────────────────────────────────────────────

export const wallQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  academic_year_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
  award_type_id: z.string().uuid().optional(),
});

export type WallQuery = z.infer<typeof wallQuerySchema>;

// ─── Leaderboard ────────────────────────────────────────────────────────────

export const LEADERBOARD_SCOPE = ['year', 'period', 'all_time'] as const;

export const leaderboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  scope: z.enum(LEADERBOARD_SCOPE).default('year'),
  year_group_id: z.string().uuid().optional(),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

// ─── Houses ─────────────────────────────────────────────────────────────────

export const bulkHouseAssignSchema = z.object({
  academic_year_id: z.string().uuid(),
  assignments: z.array(z.object({
    student_id: z.string().uuid(),
    house_id: z.string().uuid(),
  })).min(1),
});

export type BulkHouseAssignDto = z.infer<typeof bulkHouseAssignSchema>;
