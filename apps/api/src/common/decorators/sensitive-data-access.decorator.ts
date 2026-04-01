import { SetMetadata } from '@nestjs/common';

import type { AuditLogSensitivity } from '@school/shared';

export const SENSITIVE_DATA_ACCESS_KEY = 'sensitive_data_access';

export interface SensitiveDataAccessOptions {
  entityIdField?: string;
  entityType?: string;
}

export interface SensitiveDataAccessMetadata extends SensitiveDataAccessOptions {
  sensitivity: AuditLogSensitivity;
}

export function SensitiveDataAccess(
  sensitivity: AuditLogSensitivity,
  options: SensitiveDataAccessOptions = {},
) {
  return SetMetadata(SENSITIVE_DATA_ACCESS_KEY, {
    sensitivity,
    ...options,
  } satisfies SensitiveDataAccessMetadata);
}
