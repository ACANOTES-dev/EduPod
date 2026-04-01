import { Injectable } from '@nestjs/common';

import type { BulkPositiveDto, CreateIncidentDto, QuickLogDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourService } from './behaviour.service';

@Injectable()
export class BehaviourQuickLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly behaviourService: BehaviourService,
  ) {}

  /**
   * Load quick-log context: categories, templates, recent students.
   */
  async getContext(tenantId: string, userId: string) {
    const [categories, templates] = await Promise.all([
      this.prisma.behaviourCategory.findMany({
        where: { tenant_id: tenantId, is_active: true },
        orderBy: { display_order: 'asc' },
      }),
      this.prisma.behaviourDescriptionTemplate.findMany({
        where: { tenant_id: tenantId, is_active: true },
        orderBy: { display_order: 'asc' },
      }),
    ]);

    // Group templates by category_id
    const templatesByCategory: Record<string, typeof templates> = {};
    for (const tmpl of templates) {
      const catId = tmpl.category_id;
      const list = templatesByCategory[catId] ?? [];
      list.push(tmpl);
      templatesByCategory[catId] = list;
    }

    // Recent students (last 20 distinct students from user's incidents)
    const recentParticipants = await this.prisma.behaviourIncidentParticipant.findMany({
      where: {
        tenant_id: tenantId,
        participant_type: 'student',
        student_id: { not: null },
        incident: { reported_by_id: userId },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
      distinct: ['student_id'],
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group: { select: { name: true } },
          },
        },
      },
    });

    return {
      categories,
      favourites: [], // User preferences -- Phase A placeholder
      recent_students: recentParticipants
        .filter((p) => p.student)
        .map((p) => ({
          id: p.student!.id,
          first_name: p.student!.first_name,
          last_name: p.student!.last_name,
          year_group: p.student!.year_group?.name ?? null,
        })),
      current_class: null, // Schedule-aware context -- requires schedule lookup
      templates: templatesByCategory,
    };
  }

  /**
   * Quick-log: single student incident with defaults.
   */
  async quickLog(tenantId: string, userId: string, dto: QuickLogDto) {
    return this.behaviourService.createIncident(tenantId, userId, {
      category_id: dto.category_id,
      student_ids: dto.student_ids,
      description: dto.description ?? '',
      template_id: dto.template_id,
      context_type: dto.context_type,
      occurred_at: new Date().toISOString(),
      academic_year_id: dto.academic_year_id,
      schedule_entry_id: dto.schedule_entry_id,
      subject_id: dto.subject_id,
      room_id: dto.room_id,
      auto_submit: true,
      idempotency_key: dto.idempotency_key,
    } as CreateIncidentDto);
  }

  /**
   * Bulk positive: award the same category to multiple students.
   */
  async bulkPositive(tenantId: string, userId: string, dto: BulkPositiveDto) {
    const results = [];
    for (const studentId of dto.student_ids) {
      const result = await this.behaviourService.createIncident(tenantId, userId, {
        category_id: dto.category_id,
        student_ids: [studentId],
        description: dto.description ?? '',
        template_id: dto.template_id,
        context_type: dto.context_type,
        occurred_at: new Date().toISOString(),
        academic_year_id: dto.academic_year_id,
        schedule_entry_id: dto.schedule_entry_id,
        auto_submit: true,
      } as CreateIncidentDto);
      results.push(result);
    }
    return { data: results, count: results.length };
  }
}
