import { Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** Statuses excluded from point aggregations. */
const EXCLUDED_STATUSES: $Enums.IncidentStatus[] = ['draft', 'withdrawn'];

/** Shared incident filter for active, non-draft/withdrawn incidents. */
const ACTIVE_INCIDENT_FILTER: Prisma.BehaviourIncidentWhereInput = {
  status: { notIn: EXCLUDED_STATUSES },
  retention_status: 'active' as $Enums.RetentionStatus,
};

/** Redis TTL for cached point values (seconds). */
const CACHE_TTL = 300;

// ─── Return types ──────────────────────────────────────────────────────────

interface PointsResult {
  total: number;
  fromCache: boolean;
}

interface LeaderboardEntry {
  student_id: string;
  first_name: string;
  last_name: string;
  year_group: { id: string; name: string } | null;
  total_points: number;
  house: { id: string; name: string; color: string } | null;
  rank: number;
}

export interface LeaderboardResult {
  data: LeaderboardEntry[];
  meta: { page: number; pageSize: number; total: number };
}

interface LeaderboardQuery {
  page: number;
  pageSize: number;
  scope: 'year' | 'period' | 'all_time';
  year_group_id?: string;
}

export interface HouseStanding {
  house_id: string;
  name: string;
  name_ar: string | null;
  color: string;
  icon: string | null;
  total_points: number;
  member_count: number;
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Student Points ────────────────────────────────────────────────────

  async getStudentPoints(
    tenantId: string,
    studentId: string,
  ): Promise<PointsResult> {
    const cacheKey = `behaviour:points:${tenantId}:${studentId}`;
    const client = this.redis.getClient();

    // Check cache
    const cached = await client.get(cacheKey);
    if (cached !== null) {
      return { total: Number(cached), fromCache: true };
    }

    // Compute from DB
    const aggregate =
      await this.prisma.behaviourIncidentParticipant.aggregate({
        where: {
          student_id: studentId,
          tenant_id: tenantId,
          incident: ACTIVE_INCIDENT_FILTER,
        },
        _sum: { points_awarded: true },
      });

    const total = aggregate._sum.points_awarded ?? 0;

    // Write to cache
    await client.set(cacheKey, String(total), 'EX', CACHE_TTL);

    return { total, fromCache: false };
  }

  async invalidateStudentPointsCache(
    tenantId: string,
    studentId: string,
  ): Promise<void> {
    const cacheKey = `behaviour:points:${tenantId}:${studentId}`;
    await this.redis.getClient().del(cacheKey);
  }

  // ─── House Points ─────────────────────────────────────────────────────

  async getHousePoints(
    tenantId: string,
    houseId: string,
    academicYearId: string,
  ): Promise<PointsResult> {
    const cacheKey = `behaviour:house-points:${tenantId}:${houseId}:${academicYearId}`;
    const client = this.redis.getClient();

    // Check cache
    const cached = await client.get(cacheKey);
    if (cached !== null) {
      return { total: Number(cached), fromCache: true };
    }

    // Step 1: Get student IDs from house memberships for the given year
    const memberships =
      await this.prisma.behaviourHouseMembership.findMany({
        where: {
          tenant_id: tenantId,
          house_id: houseId,
          academic_year_id: academicYearId,
        },
        select: { student_id: true },
      });

    const studentIds = memberships.map((m) => m.student_id);

    if (studentIds.length === 0) {
      await client.set(cacheKey, '0', 'EX', CACHE_TTL);
      return { total: 0, fromCache: false };
    }

    // Step 2: Sum points for those students
    const aggregate =
      await this.prisma.behaviourIncidentParticipant.aggregate({
        where: {
          student_id: { in: studentIds },
          tenant_id: tenantId,
          incident: ACTIVE_INCIDENT_FILTER,
        },
        _sum: { points_awarded: true },
      });

    const total = aggregate._sum.points_awarded ?? 0;

    // Write to cache
    await client.set(cacheKey, String(total), 'EX', CACHE_TTL);

    return { total, fromCache: false };
  }

  async invalidateHousePointsCache(
    tenantId: string,
    houseId: string,
    academicYearId: string,
  ): Promise<void> {
    const cacheKey = `behaviour:house-points:${tenantId}:${houseId}:${academicYearId}`;
    await this.redis.getClient().del(cacheKey);
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────

  async getLeaderboard(
    tenantId: string,
    query: LeaderboardQuery,
  ): Promise<LeaderboardResult> {
    // Resolve date-based scope filter on the incident relation
    const incidentFilter: Prisma.BehaviourIncidentWhereInput = {
      ...ACTIVE_INCIDENT_FILTER,
      tenant_id: tenantId,
    };

    if (query.scope === 'year') {
      const currentYear = await this.prisma.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
      });
      if (currentYear) {
        incidentFilter.academic_year_id = currentYear.id;
      }
    } else if (query.scope === 'period') {
      const currentPeriod = await this.prisma.academicPeriod.findFirst({
        where: {
          tenant_id: tenantId,
          status: 'active',
        },
        orderBy: { start_date: 'desc' },
      });
      if (currentPeriod) {
        incidentFilter.academic_period_id = currentPeriod.id;
      }
    }
    // 'all_time' — no additional date filter

    // Build participant where clause
    const participantWhere: Prisma.BehaviourIncidentParticipantWhereInput =
      {
        tenant_id: tenantId,
        student_id: { not: null },
        incident: incidentFilter,
      };

    // Optional year group filter — filter via student relation
    if (query.year_group_id) {
      participantWhere.student = {
        year_group_id: query.year_group_id,
      };
    }

    // Step 1: Group by student_id to get totals + count of distinct students
    const grouped =
      await this.prisma.behaviourIncidentParticipant.groupBy({
        by: ['student_id'],
        where: participantWhere,
        _sum: { points_awarded: true },
        orderBy: { _sum: { points_awarded: 'desc' } },
      });

    const total = grouped.length;

    // Paginate the grouped results
    const start = (query.page - 1) * query.pageSize;
    const pageSlice = grouped.slice(start, start + query.pageSize);

    if (pageSlice.length === 0) {
      return {
        data: [],
        meta: { page: query.page, pageSize: query.pageSize, total },
      };
    }

    // Step 2: Fetch student details for the page
    const studentIds = pageSlice
      .map((g) => g.student_id)
      .filter((id): id is string => id !== null);

    const [students, houseMemberships] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: studentIds }, tenant_id: tenantId },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          year_group: { select: { id: true, name: true } },
        },
      }),
      // Get house membership for these students (current academic year)
      this.resolveHouseMemberships(tenantId, studentIds),
    ]);

    const studentMap = new Map(students.map((s) => [s.id, s]));

    // Build ranked leaderboard entries
    const data: LeaderboardEntry[] = pageSlice.map((g, index) => {
      const student = g.student_id
        ? studentMap.get(g.student_id)
        : undefined;
      const house = g.student_id
        ? houseMemberships.get(g.student_id) ?? null
        : null;

      return {
        student_id: g.student_id ?? '',
        first_name: student?.first_name ?? '',
        last_name: student?.last_name ?? '',
        year_group: student?.year_group ?? null,
        total_points: g._sum.points_awarded ?? 0,
        house,
        rank: start + index + 1,
      };
    });

    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── House Standings ──────────────────────────────────────────────────

  async getHouseStandings(
    tenantId: string,
    academicYearId: string,
  ): Promise<HouseStanding[]> {
    // Get all active houses
    const houses = await this.prisma.behaviourHouseTeam.findMany({
      where: { tenant_id: tenantId, is_active: true },
      orderBy: { display_order: 'asc' },
      select: {
        id: true,
        name: true,
        name_ar: true,
        color: true,
        icon: true,
      },
    });

    if (houses.length === 0) return [];

    // Get all memberships for the academic year, grouped by house
    const memberships =
      await this.prisma.behaviourHouseMembership.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
        },
        select: { house_id: true, student_id: true },
      });

    // Group student IDs by house
    const houseStudentMap = new Map<string, string[]>();
    for (const m of memberships) {
      const existing = houseStudentMap.get(m.house_id) ?? [];
      existing.push(m.student_id);
      houseStudentMap.set(m.house_id, existing);
    }

    // Collect all student IDs across all houses
    const allStudentIds = memberships.map((m) => m.student_id);

    if (allStudentIds.length === 0) {
      return houses.map((h) => ({
        house_id: h.id,
        name: h.name,
        name_ar: h.name_ar,
        color: h.color,
        icon: h.icon,
        total_points: 0,
        member_count: 0,
      }));
    }

    // Get point totals grouped by student
    const pointsByStudent =
      await this.prisma.behaviourIncidentParticipant.groupBy({
        by: ['student_id'],
        where: {
          student_id: { in: allStudentIds },
          tenant_id: tenantId,
          incident: ACTIVE_INCIDENT_FILTER,
        },
        _sum: { points_awarded: true },
      });

    const studentPointsMap = new Map(
      pointsByStudent.map((p) => [
        p.student_id,
        p._sum.points_awarded ?? 0,
      ]),
    );

    // Aggregate points per house
    return houses.map((house) => {
      const houseStudents = houseStudentMap.get(house.id) ?? [];
      const totalPoints = houseStudents.reduce(
        (sum, studentId) => sum + (studentPointsMap.get(studentId) ?? 0),
        0,
      );

      return {
        house_id: house.id,
        name: house.name,
        name_ar: house.name_ar,
        color: house.color,
        icon: house.icon,
        total_points: totalPoints,
        member_count: houseStudents.length,
      };
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  /**
   * Resolve house memberships for a set of students in the current
   * academic year. Returns a map of studentId -> house info.
   */
  private async resolveHouseMemberships(
    tenantId: string,
    studentIds: string[],
  ): Promise<Map<string, { id: string; name: string; color: string }>> {
    // Find the current academic year
    const currentYear = await this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true },
    });

    if (!currentYear) return new Map();

    const memberships =
      await this.prisma.behaviourHouseMembership.findMany({
        where: {
          tenant_id: tenantId,
          student_id: { in: studentIds },
          academic_year_id: currentYear.id,
        },
        select: {
          student_id: true,
          house: {
            select: { id: true, name: true, color: true },
          },
        },
      });

    return new Map(
      memberships.map((m) => [
        m.student_id,
        { id: m.house.id, name: m.house.name, color: m.house.color },
      ]),
    );
  }
}
