import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
  new_submission: ['reviewed', 'closed', 'spam'],
  reviewed: ['closed', 'spam'],
  closed: [],
  spam: [],
};

interface ListSubmissionsFilters {
  page: number;
  pageSize: number;
  status?: string;
  include_spam?: boolean;
}

@Injectable()
export class ContactFormService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async submit(
    tenantId: string,
    dto: {
      name: string;
      email: string;
      phone?: string | null;
      message: string;
      _honeypot?: string;
    },
    sourceIp: string | null,
  ) {
    // Rate limit check: max 5 submissions per IP per hour
    if (sourceIp) {
      const rateLimitKey = `rate:contact:${tenantId}:${sourceIp}`;
      const client = this.redis.getClient();
      const current = await client.incr(rateLimitKey);
      if (current === 1) {
        await client.expire(rateLimitKey, 3600);
      }
      if (current > 5) {
        throw new BadRequestException({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many submissions. Please try again later.',
        });
      }
    }

    // Honeypot check — if the bot-trap field is filled, mark as spam silently
    const isSpam = dto._honeypot !== undefined && dto._honeypot !== '';

    return this.prisma.contactFormSubmission.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone ?? null,
        message: dto.message,
        source_ip: sourceIp,
        status: isSpam ? 'spam' : 'new_submission',
      },
    });
  }

  async list(tenantId: string, filters: ListSubmissionsFilters) {
    const { page, pageSize, status, include_spam } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) {
      where.status = status === 'new' ? 'new_submission' : status;
    } else if (!include_spam) {
      where.status = { not: 'spam' };
    }

    const [submissions, total] = await Promise.all([
      this.prisma.contactFormSubmission.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.contactFormSubmission.count({ where }),
    ]);

    return { data: submissions, meta: { page, pageSize, total } };
  }

  async updateStatus(tenantId: string, id: string, newStatus: string) {
    const submission = await this.prisma.contactFormSubmission.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: `Contact form submission with id "${id}" not found`,
      });
    }

    const currentStatus = submission.status as string;
    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${currentStatus}" to "${newStatus}"`,
      });
    }

    return this.prisma.contactFormSubmission.update({
      where: { id },
      data: { status: newStatus as any },
    });
  }
}
