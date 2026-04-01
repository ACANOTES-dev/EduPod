# Characterization Testing Guide

## What Are Characterization Tests?

Characterization tests (also called "golden master" tests) document the **existing behaviour** of code before refactoring. They are not about correctness -- they are about **capturing what the code does today** so you can detect unintended changes during refactoring.

The key difference from regular unit tests:

- **Unit tests**: assert the code does what it _should_ do
- **Characterization tests**: assert the code does what it _currently_ does

When a characterization test fails after refactoring, it means the behaviour changed. That change might be intentional (fix a bug) or unintentional (break a feature). Either way, it forces a conscious decision.

## When Are They Required?

Characterization tests are **mandatory** before modifying any service that is:

1. **On the hotspot list** (see below) -- services over 1000 LOC with high coupling
2. **Over 500 LOC** and not already covered by comprehensive tests
3. **Involved in a financial calculation** (invoices, payroll, fees)
4. **Part of a state machine** (status transitions with side effects)

If you are about to refactor one of these services and the corresponding `.spec.ts` file either does not exist or does not cover the methods you are changing, you must write characterization tests first.

## How to Write Them

### Pattern: Call -> Capture -> Assert

```typescript
describe('StudentsService — characterization', () => {
  // ... standard NestJS test module setup ...

  describe('findAll', () => {
    it('should return paginated results with expected shape', async () => {
      // Arrange: set up mocks to return known data
      mockPrisma.students.findMany.mockResolvedValue([MOCK_STUDENT]);
      mockPrisma.students.count.mockResolvedValue(1);

      // Act: call the method with known inputs
      const result = await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      // Assert: capture the exact output shape
      expect(result).toEqual({
        data: [expect.objectContaining({ id: MOCK_STUDENT.id })],
        meta: { page: 1, pageSize: 20, total: 1 },
      });
    });

    it('should pass correct where clause to Prisma', async () => {
      mockPrisma.students.findMany.mockResolvedValue([]);
      mockPrisma.students.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'active',
      });

      // Snapshot the exact query shape
      expect(mockPrisma.students.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'active',
          }),
        }),
      );
    });
  });
});
```

### Pattern: Snapshot Complex Results

For methods that return complex, nested objects:

```typescript
it('should produce expected report structure', async () => {
  // Set up known inputs
  mockPrisma.someModel.findMany.mockResolvedValue(KNOWN_DATA);

  const result = await service.generateReport(TENANT_ID, KNOWN_PARAMS);

  // Use Jest snapshots for complex output
  expect(result).toMatchSnapshot();
});
```

### Pattern: State Machine Transitions

```typescript
describe('updateStatus — characterization', () => {
  const VALID_TRANSITIONS: [string, string][] = [
    ['draft', 'submitted'],
    ['submitted', 'approved'],
    ['submitted', 'rejected'],
    ['approved', 'active'],
  ];

  const BLOCKED_TRANSITIONS: [string, string][] = [
    ['draft', 'approved'],
    ['active', 'draft'],
    ['rejected', 'active'],
  ];

  it.each(VALID_TRANSITIONS)('should allow transition from %s to %s', async (from, to) => {
    mockPrisma.model.findFirst.mockResolvedValue({ status: from });
    mockPrisma.model.update.mockResolvedValue({ status: to });

    await expect(service.updateStatus(TENANT_ID, RECORD_ID, to)).resolves.not.toThrow();
  });

  it.each(BLOCKED_TRANSITIONS)('should block transition from %s to %s', async (from, to) => {
    mockPrisma.model.findFirst.mockResolvedValue({ status: from });

    await expect(service.updateStatus(TENANT_ID, RECORD_ID, to)).rejects.toThrow();
  });
});
```

### Pattern: Side-Effect Verification

For methods that trigger BullMQ jobs, send notifications, or create audit records:

```typescript
it('should enqueue notification job on approval', async () => {
  mockPrisma.model.findFirst.mockResolvedValue({ status: 'submitted' });
  mockPrisma.model.update.mockResolvedValue({ status: 'approved' });

  await service.approve(TENANT_ID, RECORD_ID, APPROVER_ID);

  expect(mockQueue.add).toHaveBeenCalledWith(
    'notifications:dispatch',
    expect.objectContaining({
      tenant_id: TENANT_ID,
      type: 'approval_complete',
    }),
  );
});
```

## Hotspot Service List

These services exceed 1000 LOC and are the most dangerous to refactor. Characterization tests are **mandatory** before any modification.

| Service                            | LOC  | Module             | Key Risk                                         |
| ---------------------------------- | ---- | ------------------ | ------------------------------------------------ |
| `workload-compute.service.ts`      | 1336 | scheduling         | Complex scheduling calculations                  |
| `concern.service.ts`               | 1274 | pastoral           | Multi-step concern workflows                     |
| `behaviour-students.service.ts`    | 1230 | behaviour          | Student behaviour tracking with points/sanctions |
| `households.service.ts`            | 1154 | households         | Family relationship graph management             |
| `behaviour-sanctions.service.ts`   | 1127 | behaviour          | Sanction lifecycle with escalation               |
| `case.service.ts`                  | 1121 | pastoral           | Pastoral case management workflows               |
| `behaviour.service.ts`             | 1111 | behaviour          | Core behaviour event recording                   |
| `auth.service.ts`                  | 1110 | auth               | Authentication flows, token management           |
| `homework-analytics.service.ts`    | 1088 | homework           | Aggregation and analytics calculations           |
| `pastoral-report.service.ts`       | 1085 | pastoral           | Report generation with complex queries           |
| `safeguarding-concerns.service.ts` | 1068 | pastoral           | Safeguarding with strict access controls         |
| `critical-incident.service.ts`     | 1035 | critical-incidents | Incident management with notification chains     |
| `pastoral-dsar.service.ts`         | 1032 | pastoral           | GDPR data subject access requests                |
| `attendance-upload.service.ts`     | 1030 | attendance         | Bulk upload with validation and rollback         |
| `homework.service.ts`              | 1008 | homework           | Assignment lifecycle management                  |

## CI Check

The `scripts/check-characterization-tests.sh` script runs in CI and warns when a hotspot service is modified without a corresponding test change. It does not block the build (yet) but produces a visible warning.

Run manually:

```bash
pnpm run check:characterization
```

## Adding to the Hotspot List

When a service grows past 1000 LOC, add it to the table above and to the `HOTSPOT_SERVICES` array in `scripts/check-characterization-tests.sh`. Review the hotspot list quarterly.
