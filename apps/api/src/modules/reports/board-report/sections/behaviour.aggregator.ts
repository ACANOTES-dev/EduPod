import { Injectable } from '@nestjs/common';

import type { BehaviourSection } from '@school/shared/reports';

import type {
  BehaviourAggregator,
  PrismaTransaction,
  ResolvedTerm,
  SectionAggregatorOptions,
} from './section-aggregator.types';

/**
 * Behaviour aggregator.
 *
 * Reports the term's behaviour-incident activity, rolled up by category
 * and by year group (of the primary subject participant), with sanctions
 * + appeals outcomes and a trend comparison against the prior term.
 *
 * Filters `status != draft` so unsubmitted incidents don't inflate the
 * packet. Participants are filtered to `role: 'subject'` with a non-null
 * student_id so we attribute each incident to exactly one student's year
 * group.
 */
@Injectable()
export class BehaviourSectionAggregator implements BehaviourAggregator {
  readonly key = 'behaviour' as const;

  async aggregate(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    _options: SectionAggregatorOptions,
  ): Promise<BehaviourSection> {
    const [incidents, priorCount] = await Promise.all([
      tx.behaviourIncident.findMany({
        where: {
          tenant_id: tenantId,
          occurred_at: { gte: term.term_start, lte: term.term_end },
          status: { not: 'draft' },
        },
        select: {
          category_id: true,
          category: { select: { id: true, name: true } },
          participants: {
            where: { role: 'subject', student_id: { not: null } },
            select: {
              student: {
                select: {
                  year_group_id: true,
                  year_group: { select: { id: true, name: true } },
                },
              },
            },
          },
          sanctions: { select: { type: true } },
          appeals: { select: { decision: true } },
        },
      }),
      term.prior_term
        ? tx.behaviourIncident.count({
            where: {
              tenant_id: tenantId,
              occurred_at: {
                gte: term.prior_term.term_start,
                lte: term.prior_term.term_end,
              },
              status: { not: 'draft' },
            },
          })
        : Promise.resolve(0),
    ]);

    const categoryCounts = new Map<
      string | null,
      { id: string | null; name: string; count: number }
    >();
    const yearGroupCounts = new Map<
      string | null,
      { id: string | null; name: string; count: number }
    >();
    const sanctionCounts = new Map<string, number>();
    const appealCounts = new Map<string, number>();

    for (const incident of incidents) {
      const catKey = incident.category?.id ?? null;
      const catName = incident.category?.name ?? 'Uncategorised';
      const catBucket = categoryCounts.get(catKey) ?? {
        id: catKey,
        name: catName,
        count: 0,
      };
      catBucket.count += 1;
      categoryCounts.set(catKey, catBucket);

      const primary = incident.participants[0];
      const ygId = primary?.student?.year_group?.id ?? null;
      const ygName = primary?.student?.year_group?.name ?? 'Unassigned';
      const ygBucket = yearGroupCounts.get(ygId) ?? {
        id: ygId,
        name: ygName,
        count: 0,
      };
      ygBucket.count += 1;
      yearGroupCounts.set(ygId, ygBucket);

      for (const s of incident.sanctions) {
        const key = s.type ?? 'unspecified';
        sanctionCounts.set(key, (sanctionCounts.get(key) ?? 0) + 1);
      }

      for (const a of incident.appeals) {
        const key = a.decision ?? 'pending';
        appealCounts.set(key, (appealCounts.get(key) ?? 0) + 1);
      }
    }

    const incident_count_by_category = Array.from(categoryCounts.values())
      .map((c) => ({ category_id: c.id, category_name: c.name, count: c.count }))
      .sort((a, b) => b.count - a.count);

    const incident_count_by_year_group = Array.from(yearGroupCounts.values())
      .map((y) => ({ year_group_id: y.id, year_group_name: y.name, count: y.count }))
      .sort((a, b) => a.year_group_name.localeCompare(b.year_group_name));

    const sanction_outcomes = Array.from(sanctionCounts.entries())
      .map(([sanction_type, count]) => ({ sanction_type, count }))
      .sort((a, b) => b.count - a.count);

    const appeals_outcomes = Array.from(appealCounts.entries())
      .map(([outcome, count]) => ({ outcome, count }))
      .sort((a, b) => b.count - a.count);

    return {
      type: 'behaviour',
      incident_count_total: incidents.length,
      incident_count_by_category,
      incident_count_by_year_group,
      sanction_outcomes,
      appeals_outcomes,
      trend_vs_prior_term: {
        current: incidents.length,
        prior: priorCount,
        delta: incidents.length - priorCount,
      },
    };
  }
}
