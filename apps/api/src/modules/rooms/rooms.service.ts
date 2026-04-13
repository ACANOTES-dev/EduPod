import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';

import type {
  BulkCreateRoomsDto,
  BulkDeleteRoomsDto,
  CreateRoomDto,
  UpdateRoomDto,
} from './dto/room.dto';

interface ListRoomsParams {
  page: number;
  pageSize: number;
  active?: boolean;
  room_type?: string;
}

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SchedulesReadFacade))
    private readonly schedulesReadFacade: SchedulesReadFacade,
  ) {}

  // ─── Stats ──────────────────────────────────────────────────────────────────

  async getStats(tenantId: string) {
    const [totalRooms, activeRooms, inactiveRooms, typeBreakdown, capacityAgg] = await Promise.all([
      this.prisma.room.count({ where: { tenant_id: tenantId } }),
      this.prisma.room.count({ where: { tenant_id: tenantId, active: true } }),
      this.prisma.room.count({ where: { tenant_id: tenantId, active: false } }),
      this.prisma.room.groupBy({
        by: ['room_type'],
        where: { tenant_id: tenantId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.room.aggregate({
        where: { tenant_id: tenantId, active: true, room_type: 'classroom' },
        _sum: { capacity: true },
      }),
    ]);

    return {
      total_rooms: totalRooms,
      active_rooms: activeRooms,
      inactive_rooms: inactiveRooms,
      total_capacity: capacityAgg._sum.capacity ?? 0,
      type_breakdown: typeBreakdown.map((row) => ({
        room_type: row.room_type,
        count: row._count.id,
      })),
    };
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateRoomDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.room.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            room_type: dto.room_type ?? 'classroom',
            capacity: dto.capacity ?? null,
            is_exclusive: dto.is_exclusive ?? true,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'ROOM_NAME_EXISTS',
          message: `A room with name "${dto.name}" already exists for this tenant`,
        });
      }
      throw err;
    }
  }

  async findAll(tenantId: string, params: ListRoomsParams) {
    const { page, pageSize, active, room_type } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.RoomWhereInput = { tenant_id: tenantId };

    if (active !== undefined) where.active = active;
    if (room_type) where.room_type = room_type as $Enums.RoomType;

    const [data, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.room.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!room) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: `Room with id "${id}" not found`,
      });
    }

    return room;
  }

  async update(tenantId: string, id: string, dto: UpdateRoomDto) {
    await this.assertExists(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        const updateData: Prisma.RoomUpdateInput = {};
        if (dto.name !== undefined) updateData.name = dto.name;
        if (dto.room_type !== undefined) updateData.room_type = dto.room_type;
        if (dto.capacity !== undefined) updateData.capacity = dto.capacity;
        if (dto.is_exclusive !== undefined) updateData.is_exclusive = dto.is_exclusive;
        if (dto.active !== undefined) updateData.active = dto.active;

        return db.room.update({
          where: { id },
          data: updateData,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'ROOM_NAME_EXISTS',
          message: `A room with name "${dto.name}" already exists for this tenant`,
        });
      }
      throw err;
    }
  }

  async remove(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);

    // Check if room is referenced by any schedules
    const scheduleCount = await this.schedulesReadFacade.countByRoom(tenantId, id);

    if (scheduleCount > 0) {
      throw new ConflictException({
        code: 'ROOM_IN_USE',
        message: `Room is assigned to ${scheduleCount} schedule(s) and cannot be deleted`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.room.delete({
        where: { id },
      });
    });
  }

  // ─── Bulk operations ────────────────────────────────────────────────────────

  /** Create multiple rooms in a single RLS transaction. */
  async bulkCreate(tenantId: string, dto: BulkCreateRoomsDto) {
    // Pre-check for name collisions with existing rooms
    const incomingNames = dto.rooms.map((r) => r.name);
    const existing = await this.prisma.room.findMany({
      where: { tenant_id: tenantId, name: { in: incomingNames } },
      select: { name: true },
    });

    if (existing.length > 0) {
      const dupes = existing.map((r) => r.name);
      throw new ConflictException({
        code: 'ROOM_NAMES_EXIST',
        message: `The following room names already exist: ${dupes.join(', ')}`,
        details: { duplicates: dupes },
      });
    }

    // Also check for duplicates within the incoming batch
    const uniqueNames = new Set(incomingNames);
    if (uniqueNames.size !== incomingNames.length) {
      const seen = new Set<string>();
      const batchDupes: string[] = [];
      for (const name of incomingNames) {
        if (seen.has(name)) batchDupes.push(name);
        seen.add(name);
      }
      throw new ConflictException({
        code: 'ROOM_NAMES_DUPLICATE_IN_BATCH',
        message: `Duplicate room names in batch: ${[...new Set(batchDupes)].join(', ')}`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const created = [];

      for (const room of dto.rooms) {
        const record = await db.room.create({
          data: {
            tenant_id: tenantId,
            name: room.name,
            room_type: room.room_type ?? 'classroom',
            capacity: room.capacity ?? null,
            is_exclusive: room.is_exclusive ?? true,
          },
        });
        created.push(record);
      }

      return { created: created.length, rooms: created };
    });
  }

  /** Delete multiple rooms in a single RLS transaction. Rooms in use are skipped with a warning. */
  async bulkDelete(tenantId: string, dto: BulkDeleteRoomsDto) {
    // Verify all rooms exist and belong to this tenant
    const rooms = await this.prisma.room.findMany({
      where: { tenant_id: tenantId, id: { in: dto.ids } },
      select: { id: true, name: true },
    });

    const foundIds = new Set(rooms.map((r) => r.id));
    const notFound = dto.ids.filter((id) => !foundIds.has(id));

    if (notFound.length > 0) {
      throw new NotFoundException({
        code: 'ROOMS_NOT_FOUND',
        message: `${notFound.length} room(s) not found`,
        details: { not_found_ids: notFound },
      });
    }

    // Check which rooms are in use by schedules
    const inUseIds: string[] = [];
    const deletableIds: string[] = [];

    for (const room of rooms) {
      const count = await this.schedulesReadFacade.countByRoom(tenantId, room.id);
      if (count > 0) {
        inUseIds.push(room.id);
      } else {
        deletableIds.push(room.id);
      }
    }

    if (deletableIds.length === 0 && inUseIds.length > 0) {
      throw new ConflictException({
        code: 'ALL_ROOMS_IN_USE',
        message: `All ${inUseIds.length} selected room(s) are assigned to schedules and cannot be deleted`,
      });
    }

    let deletedCount = 0;

    if (deletableIds.length > 0) {
      const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

      await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        const result = await db.room.deleteMany({
          where: { id: { in: deletableIds } },
        });
        deletedCount = result.count;
      });
    }

    return {
      deleted: deletedCount,
      skipped_in_use: inUseIds.length,
      skipped_ids: inUseIds,
    };
  }

  // --- Private helpers ---

  private async assertExists(tenantId: string, id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!room) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: `Room with id "${id}" not found`,
      });
    }
  }
}
