import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { PlatformLegalService } from './platform-legal.service';

@Injectable()
export class SubProcessorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformLegalService: PlatformLegalService,
  ) {}

  async getCurrentRegister() {
    await this.platformLegalService.ensureSeeded();

    const current = await this.prisma.subProcessorRegisterVersion.findFirst({
      orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
      include: {
        entries: {
          orderBy: { display_order: 'asc' },
        },
      },
    });

    if (!current) {
      throw new NotFoundException({
        error: {
          code: 'SUB_PROCESSOR_REGISTER_NOT_FOUND',
          message: 'No sub-processor register is available.',
        },
      });
    }

    return current;
  }

  async getHistory() {
    await this.platformLegalService.ensureSeeded();

    return this.prisma.subProcessorRegisterVersion.findMany({
      orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
      include: {
        entries: {
          orderBy: { display_order: 'asc' },
        },
      },
    });
  }
}
