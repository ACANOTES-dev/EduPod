import { z } from 'zod';

import {
  BREACH_DATA_CATEGORIES,
  SECURITY_INCIDENT_EVENT_TYPES,
  SECURITY_INCIDENT_SEVERITIES,
  SECURITY_INCIDENT_STATUSES,
  SECURITY_INCIDENT_TYPES,
} from './incident.types';

// Create incident (manual creation by platform admin)
export const createSecurityIncidentSchema = z.object({
  severity: z.enum(SECURITY_INCIDENT_SEVERITIES),
  incident_type: z.enum(SECURITY_INCIDENT_TYPES),
  description: z.string().min(10).max(5000),
  affected_tenants: z.array(z.string().uuid()).optional(),
  affected_data_subjects_count: z.number().int().min(0).optional(),
  data_categories_affected: z.array(z.enum(BREACH_DATA_CATEGORIES)).optional(),
  containment_actions: z.string().max(5000).optional(),
  assigned_to_user_id: z.string().uuid().optional(),
});
export type CreateSecurityIncidentDto = z.infer<typeof createSecurityIncidentSchema>;

// Update incident
export const updateSecurityIncidentSchema = z.object({
  severity: z.enum(SECURITY_INCIDENT_SEVERITIES).optional(),
  status: z.enum(SECURITY_INCIDENT_STATUSES).optional(),
  description: z.string().min(10).max(5000).optional(),
  affected_tenants: z.array(z.string().uuid()).optional(),
  affected_data_subjects_count: z.number().int().min(0).optional(),
  data_categories_affected: z.array(z.enum(BREACH_DATA_CATEGORIES)).optional(),
  containment_actions: z.string().max(5000).optional(),
  root_cause: z.string().max(5000).optional(),
  remediation: z.string().max(5000).optional(),
  assigned_to_user_id: z.string().uuid().nullable().optional(),
  dpc_reference_number: z.string().max(50).optional(),
});
export type UpdateSecurityIncidentDto = z.infer<typeof updateSecurityIncidentSchema>;

// Create timeline event
export const createIncidentEventSchema = z.object({
  event_type: z.enum(SECURITY_INCIDENT_EVENT_TYPES),
  description: z.string().min(1).max(5000),
});
export type CreateIncidentEventDto = z.infer<typeof createIncidentEventSchema>;

// List/filter incidents
export const listSecurityIncidentsSchema = z.object({
  status: z.enum(SECURITY_INCIDENT_STATUSES).optional(),
  severity: z.enum(SECURITY_INCIDENT_SEVERITIES).optional(),
  incident_type: z.enum(SECURITY_INCIDENT_TYPES).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListSecurityIncidentsDto = z.infer<typeof listSecurityIncidentsSchema>;

// DPC notification recording
export const notifyDpcSchema = z.object({
  dpc_reference_number: z.string().min(1).max(50),
  notes: z.string().max(5000).optional(),
});
export type NotifyDpcDto = z.infer<typeof notifyDpcSchema>;

// Controller notification
export const notifyControllersSchema = z.object({
  tenant_ids: z.array(z.string().uuid()).min(1),
  message: z.string().min(10).max(5000),
});
export type NotifyControllersDto = z.infer<typeof notifyControllersSchema>;
