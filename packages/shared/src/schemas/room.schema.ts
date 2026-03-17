import { z } from 'zod';

const roomTypeEnum = z.enum([
  'classroom', 'lab', 'gym', 'auditorium', 'library',
  'computer_lab', 'art_room', 'music_room', 'outdoor', 'other',
]);

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
