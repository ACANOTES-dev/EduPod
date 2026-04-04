import { Injectable, NotFoundException } from '@nestjs/common';

import type { CreateRoomClosureDto } from '@school/shared';

import { withRls } from '../../common/helpers/with-rls';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';

interface ListParams {
  page: number;
  pageSize: number;
  room_id?: string;
  date_from?: string;
  date_to?: string;
}

const INCLUDE_RELATIONS = {
  room: { select: { id: true, name: true } },
  created_by: { select: { id: true, first_name: true, last_name: true } },
} as const;

@Injectable()
export class RoomClosuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomsReadFacade: RoomsReadFacade,
  ) {}

  // ─── List ──────────────────────────────────────────────────────────────────

  async list(tenantId: string, params: ListParams) {
    const { page, pageSize, room_id, date_from, date_to } = params;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };

    if (room_id) where['room_id'] = room_id;

    if (date_from || date_to) {
      // Filter closures that overlap with the requested date range
      const andConditions: Record<string, unknown>[] = [];
      if (date_from) {
        andConditions.push({ date_to: { gte: new Date(date_from) } });
      }
      if (date_to) {
        andConditions.push({ date_from: { lte: new Date(date_to) } });
      }
      if (andConditions.length > 0) {
        where['AND'] = andConditions;
      }
    }

    const result = await this.roomsReadFacade.findClosuresPaginated(tenantId, {
      skip,
      take: pageSize,
      where: (() => {
        const w: Record<string, unknown> = {};
        if (room_id) w['room_id'] = room_id;
        if (where['AND']) w['AND'] = where['AND'];
        return w;
      })(),
      include: INCLUDE_RELATIONS,
    });
    const data = result.data as Record<string, unknown>[];
    const total = result.total;

    return {
      data: data.map((rc) => this.formatClosure(rc)),
      meta: { page, pageSize, total },
    };
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateRoomClosureDto) {
    // Validate room exists
    await this.roomsReadFacade.existsOrThrow(tenantId, dto.room_id);

    const record = (await withRls(this.prisma, { tenant_id: tenantId }, async (tx) => {
      return tx.roomClosure.create({
        data: {
          tenant_id: tenantId,
          room_id: dto.room_id,
          date_from: new Date(dto.date_from),
          date_to: new Date(dto.date_to),
          reason: dto.reason,
          created_by_user_id: userId,
        },
        include: INCLUDE_RELATIONS,
      });
    })) as unknown as Record<string, unknown>;

    return this.formatClosure(record);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    const existing = await this.roomsReadFacade.findClosureById(tenantId, id);

    if (!existing) {
      throw new NotFoundException({
        code: 'ROOM_CLOSURE_NOT_FOUND',
        message: `Room closure "${id}" not found`,
      });
    }

    await withRls(this.prisma, { tenant_id: tenantId }, async (tx) => {
      await tx.roomClosure.delete({ where: { id } });
    });

    return { message: 'Room closure deleted' };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private formatClosure(rc: Record<string, unknown>): Record<string, unknown> {
    const result = { ...rc };
    if (result['date_from'] instanceof Date) {
      result['date_from'] = (result['date_from'] as Date).toISOString().slice(0, 10);
    }
    if (result['date_to'] instanceof Date) {
      result['date_to'] = (result['date_to'] as Date).toISOString().slice(0, 10);
    }
    if (result['created_at'] instanceof Date) {
      result['created_at'] = (result['created_at'] as Date).toISOString();
    }
    return result;
  }
}
