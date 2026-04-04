/**
 * RoomsReadFacade — Centralized read service for room and room-closure data.
 *
 * PURPOSE:
 * The rooms module owns `room` and `roomClosure`. These are queried cross-module by
 * scheduling (6 files), schedules (2 files), scheduling-runs (1), and class-requirements (1)
 * for room validation, solver input assembly, utilisation calculations, and room type lookups.
 *
 * This facade provides a single, well-typed entry point for all cross-module
 * room reads. Queries like "find active rooms", "validate room exists", and
 * "list room closures" are consolidated here.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found (callers decide whether to throw).
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface RoomSummaryRow {
  id: string;
  name: string;
  room_type: string;
  capacity: number | null;
  is_exclusive: boolean;
  active: boolean;
}

export interface RoomBasicRow {
  id: string;
  name: string;
  capacity: number | null;
}

export interface RoomClosureRow {
  room_id: string;
  date_from: Date;
  date_to: Date;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class RoomsReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Single-record lookups ──────────────────────────────────────────────────

  /**
   * Find a room by ID with all summary fields.
   * Returns `null` if not found.
   */
  async findById(tenantId: string, roomId: string): Promise<RoomSummaryRow | null> {
    return this.prisma.room.findFirst({
      where: { id: roomId, tenant_id: tenantId },
      select: {
        id: true,
        name: true,
        room_type: true,
        capacity: true,
        is_exclusive: true,
        active: true,
      },
    }) as unknown as Promise<RoomSummaryRow | null>;
  }

  /**
   * Assert that a room exists for the given tenant. Throws NotFoundException if not.
   * Used by schedules, class-requirements, and room-closures to validate room references.
   */
  async existsOrThrow(tenantId: string, roomId: string): Promise<void> {
    const found = await this.prisma.room.findFirst({
      where: { id: roomId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: `Room with id "${roomId}" not found`,
      });
    }
  }

  /**
   * Check if a room exists (returns boolean, does not throw).
   */
  async exists(tenantId: string, roomId: string): Promise<boolean> {
    const found = await this.prisma.room.findFirst({
      where: { id: roomId, tenant_id: tenantId },
      select: { id: true },
    });
    return found !== null;
  }

  // ─── List / batch queries ───────────────────────────────────────────────────

  /**
   * Find all active rooms for a tenant. Used by scheduler orchestration
   * for solver input and analytics for utilisation.
   */
  async findActiveRooms(tenantId: string): Promise<RoomSummaryRow[]> {
    return this.prisma.room.findMany({
      where: { tenant_id: tenantId, active: true },
      select: {
        id: true,
        name: true,
        room_type: true,
        capacity: true,
        is_exclusive: true,
        active: true,
      },
    }) as unknown as Promise<RoomSummaryRow[]>;
  }

  /**
   * Find active rooms with basic display fields (id, name, capacity).
   * Used by scheduling analytics for room utilisation display.
   */
  async findActiveRoomBasics(tenantId: string): Promise<RoomBasicRow[]> {
    return this.prisma.room.findMany({
      where: { tenant_id: tenantId, active: true },
      select: { id: true, name: true, capacity: true },
    });
  }

  /**
   * Count active rooms for a tenant. Used by scheduling dashboard
   * for total room slot calculations.
   */
  async countActiveRooms(tenantId: string): Promise<number> {
    return this.prisma.room.count({
      where: { tenant_id: tenantId, active: true },
    });
  }

  // ─── Room Closures ──────────────────────────────────────────────────────────

  /**
   * Find all room closures for a tenant. Used by scheduler orchestration
   * for solver input assembly.
   */
  async findAllClosures(tenantId: string): Promise<RoomClosureRow[]> {
    return this.prisma.roomClosure.findMany({
      where: { tenant_id: tenantId },
      select: { room_id: true, date_from: true, date_to: true },
    });
  }

  /**
   * Paginated list of room closures with room and created_by details.
   * Used by scheduling/room-closures for the management UI.
   */
  async findClosuresPaginated(
    tenantId: string,
    opts: {
      skip: number;
      take: number;
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
    },
  ): Promise<{ data: unknown[]; total: number }> {
    const baseWhere = { tenant_id: tenantId, ...opts.where };
    const [data, total] = await Promise.all([
      this.prisma.roomClosure.findMany({
        where: baseWhere,
        skip: opts.skip,
        take: opts.take,
        orderBy: { date_from: 'desc' },
        ...(opts.include && { include: opts.include }),
      }),
      this.prisma.roomClosure.count({ where: baseWhere }),
    ]);
    return { data, total };
  }

  /**
   * Check if a room closure exists by ID. Returns the row or null.
   * Used by scheduling/room-closures for delete validation.
   */
  async findClosureById(tenantId: string, closureId: string): Promise<{ id: string } | null> {
    return this.prisma.roomClosure.findFirst({
      where: { id: closureId, tenant_id: tenantId },
      select: { id: true },
    });
  }
}
