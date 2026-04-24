import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

const fields: readonly FieldDescriptor[] = [
  {
    id: 'behaviour_incident.identity.incident_number',
    label_key: 'reports.fields.behaviour_incident.identity.incident_number',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'incident_number',
    permission: 'behaviour.view',
  },
  {
    id: 'behaviour_incident.identity.polarity',
    label_key: 'reports.fields.behaviour_incident.identity.polarity',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: ['positive', 'negative', 'neutral'],
    resolver: 'polarity',
    permission: 'behaviour.view',
  },
  {
    id: 'behaviour_incident.identity.severity',
    label_key: 'reports.fields.behaviour_incident.identity.severity',
    domain: 'identity',
    type: 'number',
    filterable: true,
    groupable: true,
    aggregations: ['count', 'avg', 'min', 'max'],
    resolver: 'severity',
    permission: 'behaviour.view',
  },
  {
    id: 'behaviour_incident.identity.status',
    label_key: 'reports.fields.behaviour_incident.identity.status',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: [
      'draft',
      'active',
      'investigating',
      'under_review',
      'awaiting_approval',
      'awaiting_parent_meeting',
      'escalated',
      'resolved',
      'withdrawn',
      'closed_after_appeal',
      'superseded',
      'converted_to_safeguarding',
    ],
    resolver: 'status',
    permission: 'behaviour.view',
  },
  {
    id: 'behaviour_incident.context.location',
    label_key: 'reports.fields.behaviour_incident.context.location',
    domain: 'context',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'location',
    permission: 'behaviour.view',
  },
  {
    id: 'behaviour_incident.context.category_name',
    label_key: 'reports.fields.behaviour_incident.context.category_name',
    domain: 'context',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'category_name',
    permission: 'behaviour.view',
  },
  {
    id: 'behaviour_incident.timing.occurred_at',
    label_key: 'reports.fields.behaviour_incident.timing.occurred_at',
    domain: 'timing',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'occurred_at',
    permission: 'behaviour.view',
  },
  {
    id: 'behaviour_incident.timing.logged_at',
    label_key: 'reports.fields.behaviour_incident.timing.logged_at',
    domain: 'timing',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'logged_at',
    permission: 'behaviour.view',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'behaviour_incident',
  label_key: 'reports.subjects.behaviour_incident.label',
  icon_name: 'AlertTriangle',
  primary_model: 'BehaviourIncident',
  fields,
};

type BehaviourIncidentRow = {
  id: string;
  incident_number: string;
  polarity: string;
  severity: number;
  status: string;
  location: string | null;
  occurred_at: Date;
  logged_at: Date;
  category: { id: string; name: string } | null;
};

export const BEHAVIOUR_INCIDENT_ADAPTER: SubjectAdapter = buildAdapter<BehaviourIncidentRow>({
  descriptor,
  filterColumnMap: {
    'behaviour_incident.identity.incident_number': 'incident_number',
    'behaviour_incident.identity.polarity': 'polarity',
    'behaviour_incident.identity.severity': 'severity',
    'behaviour_incident.identity.status': 'status',
    'behaviour_incident.context.location': 'location',
    'behaviour_incident.context.category_name': 'category.name',
    'behaviour_incident.timing.occurred_at': 'occurred_at',
    'behaviour_incident.timing.logged_at': 'logged_at',
  },
  selectFragment: {
    id: true,
    incident_number: true,
    polarity: true,
    severity: true,
    status: true,
    location: true,
    occurred_at: true,
    logged_at: true,
    category: { select: { id: true, name: true } },
  },
  defaultOrderBy: [{ occurred_at: 'desc' }],
  getDelegate: (tx) => tx.behaviourIncident as unknown as PrismaDelegate,
  resolvers: {
    incident_number: (r) => r.incident_number,
    polarity: (r) => r.polarity,
    severity: (r) => r.severity,
    status: (r) => r.status,
    location: (r) => r.location,
    occurred_at: (r) => r.occurred_at,
    logged_at: (r) => r.logged_at,
    category_name: (r) => r.category?.name ?? null,
  },
});
