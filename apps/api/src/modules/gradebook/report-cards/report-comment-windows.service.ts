import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CommentWindowStatus, Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

import type { CreateCommentWindowDto, UpdateCommentWindowDto } from './dto/comment-window.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListCommentWindowsQuery {
  page?: number;
  pageSize?: number;
  status?: CommentWindowStatus;
  academic_period_id?: string;
}

// ─── State transitions ───────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<CommentWindowStatus, CommentWindowStatus[]> = {
  scheduled: ['open', 'closed'],
  open: ['closed'],
  closed: ['open'],
};

function assertTransitionAllowed(from: CommentWindowStatus, to: CommentWindowStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException({
      code: 'INVALID_WINDOW_TRANSITION',
      message: `Cannot transition comment window from "${from}" to "${to}"`,
    });
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCommentWindowsService {
  private readonly logger = new Logger(ReportCommentWindowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findActive(tenantId: string) {
    return this.prisma.reportCommentWindow.findFirst({
      where: { tenant_id: tenantId, status: 'open' },
      orderBy: { opens_at: 'desc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const window = await this.prisma.reportCommentWindow.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!window) {
      throw new NotFoundException({
        code: 'COMMENT_WINDOW_NOT_FOUND',
        message: `Comment window "${id}" not found`,
      });
    }
    return window;
  }

  async findByPeriod(tenantId: string, academicPeriodId: string) {
    return this.prisma.reportCommentWindow.findMany({
      where: { tenant_id: tenantId, academic_period_id: academicPeriodId },
      orderBy: { opens_at: 'desc' },
    });
  }

  async list(tenantId: string, query: ListCommentWindowsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ReportCommentWindowWhereInput = { tenant_id: tenantId };
    if (query.status) where.status = query.status;
    if (query.academic_period_id) where.academic_period_id = query.academic_period_id;

    const [data, total] = await Promise.all([
      this.prisma.reportCommentWindow.findMany({
        where,
        orderBy: { opens_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.reportCommentWindow.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async open(tenantId: string, actorUserId: string, dto: CreateCommentWindowDto) {
    // Pre-flight: friendly error if another window is already open
    const existingOpen = await this.prisma.reportCommentWindow.findFirst({
      where: { tenant_id: tenantId, status: 'open' },
    });
    if (existingOpen) {
      throw new ConflictException({
        code: 'COMMENT_WINDOW_ALREADY_OPEN',
        message: `Another comment window is already open (id "${existingOpen.id}"). Close it before opening a new one.`,
      });
    }

    const opensAt = new Date(dto.opens_at);
    const closesAt = new Date(dto.closes_at);
    const now = new Date();
    const initialStatus: CommentWindowStatus = opensAt <= now ? 'open' : 'scheduled';

    // Verify academic period belongs to tenant
    const period = await this.academicReadFacade.findPeriodById(tenantId, dto.academic_period_id);
    if (!period) {
      throw new NotFoundException({
        code: 'ACADEMIC_PERIOD_NOT_FOUND',
        message: `Academic period "${dto.academic_period_id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      try {
        return await db.reportCommentWindow.create({
          data: {
            tenant_id: tenantId,
            academic_period_id: dto.academic_period_id,
            opens_at: opensAt,
            closes_at: closesAt,
            instructions: dto.instructions ?? null,
            status: initialStatus,
            opened_by_user_id: actorUserId,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException({
            code: 'COMMENT_WINDOW_ALREADY_OPEN',
            message: 'Another comment window is already open for this tenant',
          });
        }
        throw err;
      }
    });
  }

  async closeNow(tenantId: string, actorUserId: string, id: string) {
    const existing = await this.findById(tenantId, id);
    assertTransitionAllowed(existing.status, 'closed');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCommentWindow.update({
        where: { id },
        data: {
          status: 'closed',
          closed_at: new Date(),
          closed_by_user_id: actorUserId,
        },
      });
    });
  }

  async extend(tenantId: string, _actorUserId: string, id: string, newClosesAt: Date) {
    const existing = await this.findById(tenantId, id);
    if (existing.status !== 'open' && existing.status !== 'scheduled') {
      throw new BadRequestException({
        code: 'INVALID_WINDOW_EXTEND',
        message: `Cannot extend a window with status "${existing.status}"`,
      });
    }
    if (newClosesAt <= existing.opens_at) {
      throw new BadRequestException({
        code: 'INVALID_WINDOW_EXTEND',
        message: 'new closes_at must be strictly after opens_at',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCommentWindow.update({
        where: { id },
        data: { closes_at: newClosesAt },
      });
    });
  }

  async reopen(tenantId: string, _actorUserId: string, id: string) {
    const existing = await this.findById(tenantId, id);
    assertTransitionAllowed(existing.status, 'open');

    // Guard against reopening when another window is already open
    const otherOpen = await this.prisma.reportCommentWindow.findFirst({
      where: { tenant_id: tenantId, status: 'open', id: { not: id } },
    });
    if (otherOpen) {
      throw new ConflictException({
        code: 'COMMENT_WINDOW_ALREADY_OPEN',
        message: `Another comment window is already open (id "${otherOpen.id}"). Close it before reopening this one.`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      try {
        return await db.reportCommentWindow.update({
          where: { id },
          data: {
            status: 'open',
            closed_at: null,
            closed_by_user_id: null,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException({
            code: 'COMMENT_WINDOW_ALREADY_OPEN',
            message: 'Another comment window is already open for this tenant',
          });
        }
        throw err;
      }
    });
  }

  async updateInstructions(
    tenantId: string,
    _actorUserId: string,
    id: string,
    dto: UpdateCommentWindowDto,
  ) {
    const existing = await this.findById(tenantId, id);

    const data: Prisma.ReportCommentWindowUpdateInput = {};
    if (dto.instructions !== undefined) data.instructions = dto.instructions;
    if (dto.opens_at !== undefined) {
      if (existing.status === 'closed') {
        throw new BadRequestException({
          code: 'INVALID_WINDOW_UPDATE',
          message: 'Cannot modify opens_at on a closed window',
        });
      }
      data.opens_at = new Date(dto.opens_at);
    }
    if (dto.closes_at !== undefined) {
      if (existing.status === 'closed') {
        throw new BadRequestException({
          code: 'INVALID_WINDOW_UPDATE',
          message: 'Cannot modify closes_at on a closed window',
        });
      }
      data.closes_at = new Date(dto.closes_at);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCommentWindow.update({ where: { id }, data });
    });
  }

  // ─── Internal enforcement ────────────────────────────────────────────────
  //
  // The single reusable cost-control primitive. Every comment write and every
  // AI call MUST go through this. Throws ForbiddenException with
  // COMMENT_WINDOW_CLOSED when no open window exists for the target period.

  async assertWindowOpenForPeriod(tenantId: string, academicPeriodId: string): Promise<void> {
    const open = await this.prisma.reportCommentWindow.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'open',
        academic_period_id: academicPeriodId,
      },
    });

    if (open) {
      const now = new Date();
      if (open.closes_at <= now) {
        // Clock has moved past the scheduled close time. Reject — a cron/admin
        // will flip status on the next tick.
        throw new ForbiddenException({
          code: 'COMMENT_WINDOW_CLOSED',
          message: 'The comment window has expired. Contact an administrator to reopen it.',
        });
      }
      return;
    }

    // No open window. Look up next scheduled window so we can give a helpful
    // error message. No access to PII here — just the upcoming opens_at.
    const next = await this.prisma.reportCommentWindow.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'scheduled',
        academic_period_id: academicPeriodId,
      },
      orderBy: { opens_at: 'asc' },
    });

    const suffix = next ? ` The next window opens at ${next.opens_at.toISOString()}.` : '';

    throw new ForbiddenException({
      code: 'COMMENT_WINDOW_CLOSED',
      message: `No comment window is currently open for this academic period.${suffix}`,
    });
  }
}
