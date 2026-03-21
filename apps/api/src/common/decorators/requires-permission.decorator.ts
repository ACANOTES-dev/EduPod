import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PERMISSION_KEY = 'requires_permission';

/**
 * Require at least one of the given permissions (OR logic).
 * Pass a single string for one required permission,
 * or multiple strings where any one grants access.
 */
export const RequiresPermission = (...permissions: string[]) =>
  SetMetadata(REQUIRES_PERMISSION_KEY, permissions.length === 1 ? permissions[0] : permissions);
