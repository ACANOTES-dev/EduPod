import { SetMetadata } from '@nestjs/common';

export const BLOCK_IMPERSONATION_KEY = 'block_impersonation';

export const BlockImpersonation = () => SetMetadata(BLOCK_IMPERSONATION_KEY, true);
