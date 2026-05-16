import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PLATFORM_PERMISSION_KEY = 'requiresPlatformPermission';

export const RequiresPlatformPermission = (permission: string) =>
  SetMetadata(REQUIRES_PLATFORM_PERMISSION_KEY, permission);
