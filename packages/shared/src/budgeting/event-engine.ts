import { z } from 'zod';

/**
 * Pure-TypeScript calculator for event / trip budgets.
 *
 * Smaller driver set than the annual model — transport, tickets, food,
 * accommodation, chaperones, equipment hire, contingency %, custom lines.
 * Outputs total / per-student / per-household / breakeven so the
 * principal can decide the household share % from a single screen.
 *
 * **Zero IO. Zero async. Zero side effects.** Same engine code runs on
 * the backend (when a trip is confirmed and fees are pushed via the
 * trip→fee integration in Wave 3 impl 10) and on the frontend (live
 * recompute as the bursar tunes inputs in Wave 4 impl 17).
 */

// ─── Driver schemas ────────────────────────────────────────────────────────

export const eventTransportSchema = z.object({
  unit_cost: z.number().min(0),
  units: z.number().int().min(0),
  notes: z.string().optional(),
});

export const eventEntryTicketsSchema = z.object({
  per_student_cost: z.number().min(0),
  count: z.number().int().min(0),
});

export const eventFoodSchema = z.object({
  per_person_cost: z.number().min(0),
  count: z.number().int().min(0),
});

export const eventAccommodationSchema = z.object({
  per_night_cost: z.number().min(0),
  nights: z.number().int().min(0),
  count: z.number().int().min(0),
});

export const eventChaperonesSchema = z.object({
  count: z.number().int().min(0),
  per_chaperone_cost: z.number().min(0),
});

export const eventEquipmentHireSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().min(1),
      cost: z.number().min(0),
    }),
  ),
});

export const eventCustomLineSchema = z.object({
  name: z.string().min(1),
  amount: z.number(),
});

export const eventDriversSchema = z.object({
  transport: eventTransportSchema.optional(),
  entry_tickets: eventEntryTicketsSchema.optional(),
  food: eventFoodSchema.optional(),
  accommodation: eventAccommodationSchema.optional(),
  chaperones: eventChaperonesSchema.optional(),
  equipment_hire: eventEquipmentHireSchema.optional(),
  contingency_pct: z.number().min(0).default(5),
  custom_lines: z.array(eventCustomLineSchema).default([]),
});
export type EventDrivers = z.infer<typeof eventDriversSchema>;

// ─── Engine I/O ────────────────────────────────────────────────────────────

export type EventEngineInputs = {
  drivers: EventDrivers;
  participant_count: number;
  household_count: number;
  /** 0..100 — how much households collectively pay; rest is school subsidy. */
  household_share_pct: number;
};

export type EventEngineLineItem = {
  name: string;
  amount: number;
  per_student: number;
};

export type EventEngineOutputs = {
  line_items: EventEngineLineItem[];
  total_cost: number;
  contingency_amount: number;
  /** Amount each participating student is invoiced (post household-share). */
  per_student_cost: number;
  /** Simple average across households; per-household siblings handled by the service. */
  per_household_cost: number;
  /** Amount households collectively pay (= total_cost × household_share_pct/100). */
  household_total: number;
  school_subsidy_amount: number;
  /** Participants needed to break even at the per-student charge; null when per-student charge is 0. */
  breakeven_participants: number | null;
};

// ─── Main entrypoint ───────────────────────────────────────────────────────

export const runEventEngine = (inputs: EventEngineInputs): EventEngineOutputs => {
  const { drivers, participant_count, household_count, household_share_pct } = inputs;
  const lines: EventEngineLineItem[] = [];
  let subtotal = 0;

  const pushLine = (name: string, amount: number): void => {
    subtotal += amount;
    lines.push({
      name,
      amount: round2(amount),
      per_student: participant_count > 0 ? round2(amount / participant_count) : 0,
    });
  };

  if (drivers.transport) {
    pushLine('Transport', drivers.transport.unit_cost * drivers.transport.units);
  }
  if (drivers.entry_tickets) {
    pushLine('Tickets', drivers.entry_tickets.per_student_cost * drivers.entry_tickets.count);
  }
  if (drivers.food) {
    pushLine('Food', drivers.food.per_person_cost * drivers.food.count);
  }
  if (drivers.accommodation) {
    pushLine(
      'Accommodation',
      drivers.accommodation.per_night_cost *
        drivers.accommodation.nights *
        drivers.accommodation.count,
    );
  }
  if (drivers.chaperones) {
    pushLine('Chaperones', drivers.chaperones.count * drivers.chaperones.per_chaperone_cost);
  }
  if (drivers.equipment_hire) {
    for (const item of drivers.equipment_hire.items) {
      pushLine(item.name, item.cost);
    }
  }
  for (const line of drivers.custom_lines) {
    pushLine(line.name, line.amount);
  }

  const contingencyAmount = subtotal * (drivers.contingency_pct / 100);
  const totalCost = subtotal + contingencyAmount;
  const householdTotal = totalCost * (household_share_pct / 100);
  const schoolSubsidyAmount = totalCost - householdTotal;
  const perStudentCost = participant_count > 0 ? householdTotal / participant_count : 0;
  const perHouseholdCost = household_count > 0 ? householdTotal / household_count : 0;

  // Breakeven semantics: number of participants needed at the current
  // per-student charge to recover the FULL trip cost (including the
  // school's subsidy). When per-student charge is 0 there's no recovery
  // possible — return null so the UI can render "n/a".
  const breakeven_participants = perStudentCost > 0 ? Math.ceil(totalCost / perStudentCost) : null;

  return {
    line_items: lines,
    total_cost: round2(totalCost),
    contingency_amount: round2(contingencyAmount),
    per_student_cost: round2(perStudentCost),
    per_household_cost: round2(perHouseholdCost),
    household_total: round2(householdTotal),
    school_subsidy_amount: round2(schoolSubsidyAmount),
    breakeven_participants,
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100;
