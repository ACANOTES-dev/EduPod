import { eventDriversSchema, runEventEngine, type EventDrivers } from './event-engine';

const allDrivers = (): EventDrivers => ({
  transport: { unit_cost: 200, units: 2 }, // 400
  entry_tickets: { per_student_cost: 15, count: 24 }, // 360
  food: { per_person_cost: 10, count: 27 }, // 270 (24 students + 3 chaperones)
  accommodation: { per_night_cost: 50, nights: 2, count: 27 }, // 2_700
  chaperones: { count: 3, per_chaperone_cost: 100 }, // 300
  equipment_hire: { items: [{ name: 'Walkie-talkies', cost: 80 }] }, // 80
  contingency_pct: 10,
  custom_lines: [{ name: 'Souvenirs', amount: 50 }], // 50
  // Subtotal = 400 + 360 + 270 + 2700 + 300 + 80 + 50 = 4_160
  // Contingency = 416
  // Total = 4_576
});

describe('runEventEngine — full driver set', () => {
  it('produces correct subtotal, contingency and total', () => {
    const out = runEventEngine({
      drivers: allDrivers(),
      participant_count: 24,
      household_count: 22,
      household_share_pct: 100,
    });

    expect(out.contingency_amount).toBeCloseTo(416, 2);
    expect(out.total_cost).toBeCloseTo(4_576, 2);
    // Each line item should appear once.
    expect(out.line_items.map((li) => li.name)).toEqual([
      'Transport',
      'Tickets',
      'Food',
      'Accommodation',
      'Chaperones',
      'Walkie-talkies',
      'Souvenirs',
    ]);
  });

  it('per_student costs reflect full cost recovery when household_share_pct = 100', () => {
    const out = runEventEngine({
      drivers: allDrivers(),
      participant_count: 24,
      household_count: 22,
      household_share_pct: 100,
    });

    // Households cover the full cost.
    expect(out.household_total).toBeCloseTo(4_576, 2);
    expect(out.school_subsidy_amount).toBeCloseTo(0, 2);
    // Per-student cost = 4_576 / 24 ≈ 190.67
    expect(out.per_student_cost).toBeCloseTo(190.67, 2);
    // Per-household cost = 4_576 / 22 ≈ 208
    expect(out.per_household_cost).toBeCloseTo(208, 2);
  });
});

describe('runEventEngine — missing optional drivers', () => {
  it('skips lines for drivers that are absent', () => {
    const out = runEventEngine({
      drivers: {
        transport: { unit_cost: 200, units: 2 }, // 400
        entry_tickets: { per_student_cost: 15, count: 20 }, // 300
        contingency_pct: 0,
        custom_lines: [],
      },
      participant_count: 20,
      household_count: 18,
      household_share_pct: 100,
    });

    expect(out.line_items.map((li) => li.name)).toEqual(['Transport', 'Tickets']);
    expect(out.contingency_amount).toBe(0);
    expect(out.total_cost).toBeCloseTo(700, 2);
  });
});

describe('runEventEngine — household share semantics', () => {
  it('free trip (household_share_pct = 0): school subsidises the whole cost', () => {
    const out = runEventEngine({
      drivers: allDrivers(),
      participant_count: 24,
      household_count: 22,
      household_share_pct: 0,
    });

    expect(out.household_total).toBe(0);
    expect(out.school_subsidy_amount).toBeCloseTo(4_576, 2);
    expect(out.per_student_cost).toBe(0);
    expect(out.per_household_cost).toBe(0);
    // Breakeven undefined when households contribute nothing.
    expect(out.breakeven_participants).toBeNull();
  });

  it('subsidised trip (household_share_pct = 60): split is 60/40', () => {
    const out = runEventEngine({
      drivers: allDrivers(),
      participant_count: 24,
      household_count: 22,
      household_share_pct: 60,
    });

    // 60% of 4_576 = 2_745.60; 40% subsidy = 1_830.40
    expect(out.household_total).toBeCloseTo(2_745.6, 2);
    expect(out.school_subsidy_amount).toBeCloseTo(1_830.4, 2);
    // Per-student = 2_745.6 / 24 = 114.4
    expect(out.per_student_cost).toBeCloseTo(114.4, 2);
  });
});

describe('runEventEngine — edge cases', () => {
  it('zero participants → per-student = 0, breakeven = null', () => {
    const out = runEventEngine({
      drivers: {
        transport: { unit_cost: 200, units: 2 },
        contingency_pct: 0,
        custom_lines: [],
      },
      participant_count: 0,
      household_count: 0,
      household_share_pct: 100,
    });

    expect(out.per_student_cost).toBe(0);
    expect(out.per_household_cost).toBe(0);
    expect(out.breakeven_participants).toBeNull();
    // Total cost still computed for record-keeping.
    expect(out.total_cost).toBeCloseTo(400, 2);
  });

  it('breakeven_participants = ceil(total_cost / per_student_cost) when both are non-zero', () => {
    const out = runEventEngine({
      drivers: {
        transport: { unit_cost: 100, units: 1 }, // 100
        contingency_pct: 0,
        custom_lines: [],
      },
      participant_count: 10,
      household_count: 10,
      household_share_pct: 50,
    });

    // total_cost = 100. household_total = 50. per_student = 5.
    // breakeven = ceil(100 / 5) = 20.
    expect(out.total_cost).toBe(100);
    expect(out.per_student_cost).toBe(5);
    expect(out.breakeven_participants).toBe(20);
  });
});

describe('eventDriversSchema', () => {
  it('applies defaults for contingency_pct and custom_lines when absent', () => {
    const parsed = eventDriversSchema.parse({});
    expect(parsed.contingency_pct).toBe(5);
    expect(parsed.custom_lines).toEqual([]);
  });

  it('rejects negative monetary values', () => {
    expect(() =>
      eventDriversSchema.parse({
        transport: { unit_cost: -1, units: 1 },
      }),
    ).toThrow();
  });
});
