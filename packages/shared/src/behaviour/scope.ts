import type { BehaviourScope } from './enums';

export type { BehaviourScope };

export interface ScopeContext {
  userId: string;
  scope: BehaviourScope;
  classStudentIds?: string[];
  yearGroupIds?: string[];
}

export interface IncidentScopeFilter {
  reported_by_id?: string;
  behaviour_incident_participants?: {
    some: {
      student_id?: { in: string[] };
      student?: { year_group_id?: { in: string[] } };
      participant_type: 'student';
    };
  };
}

export function buildScopeFilter(ctx: ScopeContext): IncidentScopeFilter | Record<string, never> {
  switch (ctx.scope) {
    case 'own':
      return { reported_by_id: ctx.userId };
    case 'class':
      return {
        behaviour_incident_participants: {
          some: {
            student_id: { in: ctx.classStudentIds ?? [] },
            participant_type: 'student',
          },
        },
      };
    case 'year_group':
      return {
        behaviour_incident_participants: {
          some: {
            student: { year_group_id: { in: ctx.yearGroupIds ?? [] } },
            participant_type: 'student',
          },
        },
      };
    case 'pastoral':
    case 'all':
      return {};
  }
}
