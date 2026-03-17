import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateRoomDto, UpdateRoomDto } from './dto/room.dto';

interface ListRoomsParams {
  page: number;
  pageSize: number;
  active?: boolean;
  room_type?: string;
}

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

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
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
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
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
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
    const scheduleCount = await this.prisma.schedule.count({
      where: { room_id: id, tenant_id: tenantId },
    });

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
