import { z } from 'zod';

export const roomTypeEnum = z.enum([
  'classroom',
  'lab',
  'gym',
  'auditorium',
  'library',
  'computer_lab',
  'art_room',
  'music_room',
  'outdoor',
  'science_lab',
  'wood_workshop',
  'outdoor_yard',
  'indoor_yard',
  'other',
]);

export type RoomTypeValue = z.infer<typeof roomTypeEnum>;

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  room_type: roomTypeEnum.optional().default('classroom'),
  capacity: z.number().int().positive().nullable().optional(),
  is_exclusive: z.boolean().optional().default(true),
});

export type CreateRoomDto = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  room_type: roomTypeEnum.optional(),
  capacity: z.number().int().positive().nullable().optional(),
  is_exclusive: z.boolean().optional(),
  active: z.boolean().optional(),
});

export type UpdateRoomDto = z.infer<typeof updateRoomSchema>;

// ─── Bulk operations ──────────────────────────────────────────────────────────

export const bulkCreateRoomsSchema = z.object({
  rooms: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        room_type: roomTypeEnum.optional().default('classroom'),
        capacity: z.number().int().positive().nullable().optional(),
        is_exclusive: z.boolean().optional().default(true),
      }),
    )
    .min(1)
    .max(200),
});

export type BulkCreateRoomsDto = z.infer<typeof bulkCreateRoomsSchema>;

export const bulkDeleteRoomsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export type BulkDeleteRoomsDto = z.infer<typeof bulkDeleteRoomsSchema>;
