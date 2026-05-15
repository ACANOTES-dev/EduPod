import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformAlertHistory } from '@prisma/client';

import type { AlertHistoryQuery } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

export type AlertHistoryRow = PlatformAlertHistory & {
  rule: { name: string };
};

@Injectable()
export class AlertHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AlertHistoryQuery): Promise<{
    data: AlertHistoryRow[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const where: Prisma.PlatformAlertHistoryWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.rule_id) where.rule_id = query.rule_id;

    const skip = (query.page - 1) * query.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.platformAlertHistory.findMany({
        where,
        orderBy: { fired_at: 'desc' },
        skip,
        take: query.pageSize,
        include: { rule: { select: { name: true } } },
      }),
      this.prisma.platformAlertHistory.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async acknowledge(id: string, userId: string): Promise<PlatformAlertHistory> {
    const alert = await this.prisma.platformAlertHistory.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException({
        code: 'ALERT_NOT_FOUND',
        message: `Alert with id "${id}" not found`,
      });
    }
    if (alert.status !== 'fired') {
      throw new BadRequestException({
        code: 'ALERT_NOT_ACKNOWLEDGEABLE',
        message: 'Only fired alerts can be acknowledged',
      });
    }

    return this.prisma.platformAlertHistory.update({
      where: { id },
      data: {
        status: 'acknowledged',
        acknowledged_at: new Date(),
        acknowledged_by: userId,
      },
    });
  }
}
