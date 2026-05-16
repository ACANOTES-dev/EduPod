import { SetMetadata } from '@nestjs/common';

export const SKIP_PLATFORM_AUDIT_KEY = 'skipPlatformAudit';

export const SkipPlatformAudit = (reason: string) => SetMetadata(SKIP_PLATFORM_AUDIT_KEY, reason);
