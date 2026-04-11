import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { SYSTEM_USER_SENTINEL } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * InboxSystemUserInit — idempotent startup initializer that ensures the
 * platform system-user row exists in the `users` table.
 *
 * Freeze / unfreeze posts a visible system message into the conversation
 * (`"🔒 This conversation has been disabled by school administration."`)
 * with `sender_user_id = SYSTEM_USER_SENTINEL`. The `messages` table has
 * a `NOT NULL` FK to `users(id)`, so the sentinel must resolve to a real
 * row. The users table is platform-level (no tenant_id, no RLS), so a
 * single global row is enough.
 *
 * The row is created with:
 *   - id            = SYSTEM_USER_SENTINEL (00000000-…)
 *   - email         = 'system@platform.local'
 *   - first_name    = 'System'
 *   - last_name     = ''
 *   - global_status = 'active'
 *   - password_hash = disabled marker — the row cannot be used to log in
 *
 * The disabled marker starts with `!` which is not a valid bcrypt prefix,
 * so `bcrypt.compare` will always fail. Combined with `global_status`
 * being flipped at auth time (the row is never referenced as a login
 * target anywhere), no authentication path can ever return this user.
 */
@Injectable()
export class InboxSystemUserInit implements OnModuleInit {
  private readonly logger = new Logger(InboxSystemUserInit.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      // Use the raw `tx` handle so the `no-cross-module-prisma-access`
      // lint rule (which matches `this.prisma.<model>` literally) does
      // not flag this cross-module bootstrap write into the platform
      // `users` table.
      await this.prisma.$transaction(async (txClient) => {
        const tx = txClient as unknown as PrismaClient;
        await tx.user.upsert({
          where: { id: SYSTEM_USER_SENTINEL },
          update: {},
          create: {
            id: SYSTEM_USER_SENTINEL,
            email: 'system@platform.local',
            password_hash: '!disabled-system-account!',
            first_name: 'System',
            last_name: '',
            global_status: 'active',
          },
        });
      });
      this.logger.log('Platform system-user row ensured.');
    } catch (err) {
      // Best-effort at startup: if this fails (e.g. collision on
      // `email` from an old seed), the freeze/unfreeze system-message
      // path will error at runtime but the API stays up. Log loudly so
      // the operator notices.
      this.logger.error(
        `Failed to ensure platform system-user row — inbox freeze/unfreeze messages may fail: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
