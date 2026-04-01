import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../modules/prisma/prisma.service';

/**
 * Startup assertion that the database connection role cannot bypass RLS.
 *
 * Queries pg_roles once at bootstrap. In production, crashes the app if the
 * role has SUPERUSER or BYPASSRLS — both render RLS policies ineffective.
 * In development, logs a critical warning without crashing (devs often use
 * a superuser locally).
 */
@Injectable()
export class RlsRoleCheckService implements OnModuleInit {
  private readonly logger = new Logger(RlsRoleCheckService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const result = await this.prisma.$queryRaw<
      Array<{ rolsuper: boolean; rolbypassrls: boolean; rolname: string }>
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    const role = result[0];
    if (!role) {
      const msg = 'Could not determine current database role — refusing to start';
      this.logger.error(msg);
      if (process.env.NODE_ENV === 'production') {
        throw new Error(msg);
      }
      return;
    }

    const isUnsafe = role.rolsuper || role.rolbypassrls;

    if (isUnsafe) {
      const reasons: string[] = [];
      if (role.rolsuper) reasons.push('SUPERUSER');
      if (role.rolbypassrls) reasons.push('BYPASSRLS');

      const message =
        `CRITICAL: Database role "${role.rolname}" has ${reasons.join(' and ')} — RLS policies are INEFFECTIVE. ` +
        'The application MUST connect as a non-superuser, non-BYPASSRLS role. ' +
        'See scripts/setup-db-role.sql for setup instructions.';

      if (process.env.NODE_ENV === 'production') {
        this.logger.error(message);
        throw new Error(message);
      } else {
        this.logger.warn(`${message} (not enforced in development)`);
      }
    } else {
      this.logger.log(
        `Database role "${role.rolname}" verified: no SUPERUSER or BYPASSRLS privileges`,
      );
    }
  }
}
