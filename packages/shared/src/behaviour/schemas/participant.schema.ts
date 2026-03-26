import { z } from 'zod';

export const createParticipantSchema = z.object({
  participant_type: z.enum(['student', 'staff', 'parent', 'visitor', 'unknown']),
  student_id: z.string().uuid().nullable().optional(),
  staff_id: z.string().uuid().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  external_name: z.string().max(200).nullable().optional(),
  role: z.enum([
    'subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator',
  ]).default('subject'),
  parent_visible: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
}).refine(
  (data) => {
    switch (data.participant_type) {
      case 'student': return !!data.student_id;
      case 'staff': return !!data.staff_id;
      case 'parent': return !!data.parent_id;
      case 'visitor':
      case 'unknown': return !!data.external_name;
      default: return false;
    }
  },
  { message: 'Matching ID or name is required for the given participant type' },
);

export type CreateParticipantDto = z.infer<typeof createParticipantSchema>;
