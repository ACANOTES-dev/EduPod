import { $Enums } from '@prisma/client';

export const ACTIVE_INCIDENT_FILTER = {
  retention_status: 'active' as $Enums.RetentionStatus,
  status: {
    notIn: ['draft', 'withdrawn'] as $Enums.IncidentStatus[],
  },
};
