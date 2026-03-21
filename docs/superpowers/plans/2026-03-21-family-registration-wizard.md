# Family Registration Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 5-step registration wizard that creates a household, parents, students, fee assignments, invoice, and optional payment in one flow — accessible from the sidebar on every page.

**Architecture:** A new `registration` NestJS module with two endpoints (preview-fees and register). Frontend is a large modal wizard with 5 step components, orchestrated by a `useReducer` state machine. The wizard calls the preview endpoint for Step 3, then the registration endpoint on confirm. Payment uses the existing `PaymentsService`.

**Tech Stack:** NestJS, Prisma (interactive transactions with RLS), Next.js App Router, Radix Dialog, Tailwind CSS, next-intl, existing finance services.

**Spec:** `docs/superpowers/specs/2026-03-21-family-registration-wizard-design.md`

---

## File Map

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `packages/shared/src/schemas/registration.schema.ts` | Zod schemas for both endpoints |
| `apps/api/src/modules/registration/registration.module.ts` | NestJS module importing dependencies |
| `apps/api/src/modules/registration/registration.controller.ts` | Two endpoints: preview-fees + register |
| `apps/api/src/modules/registration/registration.service.ts` | Core business logic: fee preview + atomic registration |

### Backend — Modified Files

| File | Change |
|------|--------|
| `apps/api/src/app.module.ts` | Import `RegistrationModule` |
| `packages/shared/src/index.ts` | Export registration schemas |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `apps/web/src/app/[locale]/(school)/_components/registration-wizard/registration-wizard.tsx` | Modal shell, step orchestration, useReducer state |
| `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-parent-household.tsx` | Step 1: parent + household + emergency contact form |
| `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-students.tsx` | Step 2: accordion student cards |
| `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-fee-summary.tsx` | Step 3: fee preview, discounts, confirm |
| `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-payment.tsx` | Step 4: optional payment recording |
| `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-complete.tsx` | Step 5: success summary + print buttons |
| `apps/web/src/app/[locale]/(school)/_components/registration-wizard/types.ts` | Shared wizard types and interfaces |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `apps/web/src/app/[locale]/(school)/layout.tsx` | Add Register Family button to sidebar |
| `apps/web/messages/en.json` | Add `registration` translation keys |
| `apps/web/messages/ar.json` | Add `registration` translation keys |

---

## Task 1: Shared Zod Schemas

**Files:**
- Create: `packages/shared/src/schemas/registration.schema.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the registration Zod schemas**

Create `packages/shared/src/schemas/registration.schema.ts` with:

```typescript
import { z } from 'zod';

// ─── Parent sub-schema ─────────────────────────────────────────────────────

const parentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(255).optional(),
  phone: z.string().min(1).max(50),
  relationship_label: z.string().min(1).max(100),
});

const optionalParentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional(),
  relationship_label: z.string().min(1).max(100),
});

// ─── Emergency contact sub-schema ──────────────────────────────────────────

const emergencyContactSchema = z.object({
  contact_name: z.string().min(1).max(200),
  phone: z.string().min(1).max(50),
  relationship_label: z.string().min(1).max(100),
});

// ─── Student sub-schema ────────────────────────────────────────────────────

const studentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  date_of_birth: z.string().min(1),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  year_group_id: z.string().uuid(),
  national_id: z.string().min(1).max(50),
});

// ─── Fee assignment sub-schema ─────────────────────────────────────────────

const feeAssignmentSchema = z.object({
  student_index: z.number().int().min(0),
  fee_structure_id: z.string().uuid(),
});

const appliedDiscountSchema = z.object({
  discount_id: z.string().uuid(),
  fee_assignment_index: z.number().int().min(0),
});

const adhocAdjustmentSchema = z.object({
  label: z.string().min(1).max(255),
  amount: z.number().positive(),
});

// ─── Main schemas ──────────────────────────────────────────────────────────

export const familyRegistrationSchema = z.object({
  primary_parent: parentSchema,
  secondary_parent: optionalParentSchema.optional(),
  household: z.object({
    household_name: z.string().min(1).max(255),
    address_line_1: z.string().max(255).optional(),
    address_line_2: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    postal_code: z.string().max(30).optional(),
  }),
  emergency_contacts: z.array(emergencyContactSchema).min(1).max(3),
  students: z.array(studentSchema).min(1),
  fee_assignments: z.array(feeAssignmentSchema),
  applied_discounts: z.array(appliedDiscountSchema).default([]),
  adhoc_adjustments: z.array(adhocAdjustmentSchema).default([]),
});

export type FamilyRegistrationDto = z.infer<typeof familyRegistrationSchema>;

export const previewFeesSchema = z.object({
  students: z.array(z.object({
    year_group_id: z.string().uuid(),
  })).min(1),
});

export type PreviewFeesDto = z.infer<typeof previewFeesSchema>;
```

- [ ] **Step 2: Export from shared package**

In `packages/shared/src/index.ts`, add the exports. Find where other schemas are exported and add:

```typescript
export {
  familyRegistrationSchema,
  type FamilyRegistrationDto,
  previewFeesSchema,
  type PreviewFeesDto,
} from './schemas/registration.schema';
```

- [ ] **Step 3: Verify shared package builds**

Run: `cd packages/shared && pnpm build`

Expected: No errors.

---

## Task 2: Backend Registration Module

**Files:**
- Create: `apps/api/src/modules/registration/registration.module.ts`
- Create: `apps/api/src/modules/registration/registration.controller.ts`
- Create: `apps/api/src/modules/registration/registration.service.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the NestJS module**

Create `apps/api/src/modules/registration/registration.module.ts`:

```typescript
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FinanceModule } from '../finance/finance.module';
import { TenantsModule } from '../tenants/tenants.module';

import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

@Module({
  imports: [AuthModule, TenantsModule, ConfigurationModule, FinanceModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
```

- [ ] **Step 2: Create the controller**

Create `apps/api/src/modules/registration/registration.controller.ts`:

```typescript
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  familyRegistrationSchema,
  previewFeesSchema,
} from '@school/shared';
import type {
  FamilyRegistrationDto,
  PreviewFeesDto,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { RegistrationService } from './registration.service';

interface JwtPayload {
  sub: string;
}

@Controller('v1/registration')
@UseGuards(AuthGuard, PermissionGuard)
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('family/preview-fees')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.OK)
  async previewFees(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(previewFeesSchema)) dto: PreviewFeesDto,
  ) {
    return this.registrationService.previewFees(tenant.tenant_id, dto);
  }

  @Post('family')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async registerFamily(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(familyRegistrationSchema)) dto: FamilyRegistrationDto,
  ) {
    return this.registrationService.registerFamily(tenant.tenant_id, user.sub, dto);
  }
}
```

- [ ] **Step 3: Create the service (preview-fees method)**

Create `apps/api/src/modules/registration/registration.service.ts`. Start with the preview method:

```typescript
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FamilyRegistrationDto, PreviewFeesDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { roundMoney } from '../finance/helpers/invoice-status.helper';
import { InvoicesService } from '../finance/invoices.service';
import { PaymentsService } from '../finance/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../configuration/settings.service';
import { SequenceService } from '../tenants/sequence.service';

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly settingsService: SettingsService,
  ) {}

  async previewFees(tenantId: string, dto: PreviewFeesDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Get active academic year for term count
      const activeYear = await db.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        include: { _count: { select: { periods: true } } },
      });
      const termCount = activeYear?._count?.periods ?? 3;

      const studentResults = [];
      let grandTotal = 0;

      for (let i = 0; i < dto.students.length; i++) {
        const s = dto.students[i];

        // Validate year group exists
        const yearGroup = await db.yearGroup.findFirst({
          where: { id: s.year_group_id, tenant_id: tenantId },
          select: { id: true, name: true },
        });
        if (!yearGroup) {
          throw new NotFoundException({
            code: 'YEAR_GROUP_NOT_FOUND',
            message: `Year group "${s.year_group_id}" not found`,
          });
        }

        // Find all active fee structures for this year group + null (household-level)
        const feeStructures = await db.feeStructure.findMany({
          where: {
            tenant_id: tenantId,
            active: true,
            OR: [
              { year_group_id: s.year_group_id },
              { year_group_id: null },
            ],
          },
          orderBy: { name: 'asc' },
        });

        const fees = feeStructures.map((fs) => {
          const baseAmount = Number(fs.amount);
          let annualAmount: number;
          switch (fs.billing_frequency) {
            case 'term':
              annualAmount = roundMoney(baseAmount * termCount);
              break;
            case 'monthly':
              annualAmount = roundMoney(baseAmount * 12);
              break;
            default: // one_off, custom
              annualAmount = baseAmount;
          }
          return {
            fee_structure_id: fs.id,
            name: fs.name,
            billing_frequency: fs.billing_frequency,
            base_amount: baseAmount,
            annual_amount: annualAmount,
          };
        });

        const subtotal = roundMoney(fees.reduce((sum, f) => sum + f.annual_amount, 0));
        grandTotal += subtotal;

        studentResults.push({
          student_index: i,
          year_group_name: yearGroup.name,
          fees,
          subtotal,
        });
      }

      // Get available discounts
      const discounts = await db.discount.findMany({
        where: { tenant_id: tenantId, active: true },
        orderBy: { name: 'asc' },
      });

      return {
        students: studentResults,
        available_discounts: discounts.map((d) => ({
          discount_id: d.id,
          name: d.name,
          discount_type: d.discount_type,
          value: Number(d.value),
        })),
        grand_total: roundMoney(grandTotal),
      };
    });
  }
```

This is the first half of the service. The `registerFamily` method is in the next task.

- [ ] **Step 4: Add the registerFamily method to the service**

Continue `registration.service.ts` — add the `registerFamily` method after `previewFees`:

```typescript
  async registerFamily(tenantId: string, userId: string, dto: FamilyRegistrationDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // ── 1. Create Household ────────────────────────────────────────────
      const householdNumber = await this.sequenceService.nextNumber(tenantId, 'household', tx, 'HH');

      const household = await db.household.create({
        data: {
          tenant_id: tenantId,
          household_name: dto.household.household_name,
          household_number: householdNumber,
          address_line_1: dto.household.address_line_1 ?? null,
          address_line_2: dto.household.address_line_2 ?? null,
          city: dto.household.city ?? null,
          country: dto.household.country ?? null,
          postal_code: dto.household.postal_code ?? null,
          status: 'active',
          needs_completion: false, // wizard provides everything
        },
      });

      // ── 2. Create Emergency Contacts ───────────────────────────────────
      for (let i = 0; i < dto.emergency_contacts.length; i++) {
        const ec = dto.emergency_contacts[i];
        await db.householdEmergencyContact.create({
          data: {
            tenant_id: tenantId,
            household_id: household.id,
            contact_name: ec.contact_name,
            phone: ec.phone,
            relationship_label: ec.relationship_label,
            display_order: i + 1,
          },
        });
      }

      // ── 3. Create Parent(s) ────────────────────────────────────────────
      const createParent = async (
        parentData: typeof dto.primary_parent,
        isPrimary: boolean,
      ) => {
        // Check if user with this email exists (platform-level, no RLS)
        let linkedUserId: string | null = null;
        if (parentData.email) {
          const existingUser = await this.prisma.user.findUnique({
            where: { email: parentData.email },
            select: { id: true },
          });
          linkedUserId = existingUser?.id ?? null;
        }

        const parent = await db.parent.create({
          data: {
            tenant_id: tenantId,
            user_id: linkedUserId,
            first_name: parentData.first_name,
            last_name: parentData.last_name,
            email: parentData.email ?? null,
            phone: parentData.phone ?? null,
            relationship_label: parentData.relationship_label,
            preferred_contact_channels: parentData.email ? ['email'] : ['sms'],
            is_primary_contact: isPrimary,
            is_billing_contact: isPrimary,
            status: 'active',
          },
        });

        // Link to household
        await db.householdParent.create({
          data: {
            household_id: household.id,
            parent_id: parent.id,
            tenant_id: tenantId,
            role_label: parentData.relationship_label,
          },
        });

        return parent;
      };

      const primaryParent = await createParent(dto.primary_parent, true);
      const parents = [primaryParent];

      if (dto.secondary_parent) {
        const secondaryParent = await createParent(
          { ...dto.secondary_parent, phone: dto.secondary_parent.phone ?? '' },
          false,
        );
        parents.push(secondaryParent);
      }

      // ── 4. Set billing parent ──────────────────────────────────────────
      await db.household.update({
        where: { id: household.id },
        data: { primary_billing_parent_id: primaryParent.id },
      });

      // ── 5. Create Students ─────────────────────────────────────────────
      const createdStudents = [];

      for (const studentData of dto.students) {
        const studentNumber = await this.sequenceService.nextNumber(tenantId, 'student', tx, 'STU');

        const student = await db.student.create({
          data: {
            tenant_id: tenantId,
            household_id: household.id,
            first_name: studentData.first_name,
            last_name: studentData.last_name,
            full_name: `${studentData.first_name} ${studentData.last_name}`,
            date_of_birth: new Date(studentData.date_of_birth),
            gender: studentData.gender,
            status: 'applicant',
            entry_date: new Date(),
            year_group_id: studentData.year_group_id,
            student_number: studentNumber,
            national_id: studentData.national_id,
          },
        });

        // Link all parents to student
        for (const parent of parents) {
          await db.studentParent.create({
            data: {
              student_id: student.id,
              parent_id: parent.id,
              tenant_id: tenantId,
              relationship_label: parent.relationship_label,
            },
          });
        }

        createdStudents.push(student);
      }

      // ── 6. Create Fee Assignments ──────────────────────────────────────
      const today = new Date();

      for (let i = 0; i < dto.fee_assignments.length; i++) {
        const fa = dto.fee_assignments[i];
        const student = createdStudents[fa.student_index];
        if (!student) continue;

        // Check if an existing discount applies to this assignment
        const matchingDiscount = dto.applied_discounts.find(
          (ad) => ad.fee_assignment_index === i,
        );

        await db.householdFeeAssignment.create({
          data: {
            tenant_id: tenantId,
            household_id: household.id,
            student_id: student.id,
            fee_structure_id: fa.fee_structure_id,
            discount_id: matchingDiscount?.discount_id ?? null,
            effective_from: today,
          },
        });
      }

      // ── 7. Generate Invoice ────────────────────────────────────────────
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { currency_code: true },
      });

      const branding = await db.tenantBranding.findUnique({
        where: { tenant_id: tenantId },
        select: { invoice_prefix: true },
      });
      const prefix = branding?.invoice_prefix ?? 'INV';

      const invoiceNumber = await this.sequenceService.nextNumber(tenantId, 'invoice', tx, prefix);

      // Get academic year dates for billing period + term count (same query as previewFees)
      const activeYear = await db.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        include: { _count: { select: { periods: true } } },
        orderBy: { start_date: 'desc' },
      });
      const termCount = (activeYear as { _count?: { periods: number } })?._count?.periods ?? 3;

      // Build invoice lines from fee assignments — fees as positive lines, discounts as separate negative lines
      const invoiceLines: {
        tenant_id: string;
        description: string;
        quantity: number;
        unit_amount: number;
        line_total: number;
        student_id: string | null;
        fee_structure_id: string | null;
        billing_period_start: Date | null;
        billing_period_end: Date | null;
      }[] = [];

      let subtotal = 0;
      let discountTotal = 0;

      for (let i = 0; i < dto.fee_assignments.length; i++) {
        const fa = dto.fee_assignments[i];
        const student = createdStudents[fa.student_index];
        if (!student) continue;

        const fs = await db.feeStructure.findFirst({
          where: { id: fa.fee_structure_id, tenant_id: tenantId },
        });
        if (!fs) continue;

        const baseAmount = Number(fs.amount);
        let annualAmount: number;
        switch (fs.billing_frequency) {
          case 'term':
            annualAmount = roundMoney(baseAmount * termCount);
            break;
          case 'monthly':
            annualAmount = roundMoney(baseAmount * 12);
            break;
          default:
            annualAmount = baseAmount;
        }

        // Fee as a positive line
        invoiceLines.push({
          tenant_id: tenantId,
          description: `${fs.name} — ${student.first_name} ${student.last_name}`,
          quantity: 1,
          unit_amount: annualAmount,
          line_total: annualAmount,
          student_id: student.id,
          fee_structure_id: fs.id,
          billing_period_start: activeYear?.start_date ?? null,
          billing_period_end: activeYear?.end_date ?? null,
        });
        subtotal += annualAmount;

        // Discount as a separate negative line (if applied)
        const matchingDiscount = dto.applied_discounts.find(
          (ad) => ad.fee_assignment_index === i,
        );
        if (matchingDiscount) {
          const discount = await db.discount.findFirst({
            where: { id: matchingDiscount.discount_id, tenant_id: tenantId },
          });
          if (discount) {
            const discountValue = discount.discount_type === 'percent'
              ? roundMoney(annualAmount * Number(discount.value) / 100)
              : Math.min(Number(discount.value), annualAmount);
            invoiceLines.push({
              tenant_id: tenantId,
              description: `Discount: ${discount.name} — ${student.first_name} ${student.last_name}`,
              quantity: 1,
              unit_amount: roundMoney(-discountValue),
              line_total: roundMoney(-discountValue),
              student_id: student.id,
              fee_structure_id: null,
              billing_period_start: null,
              billing_period_end: null,
            });
            discountTotal += discountValue;
          }
        }
      }

      // Add ad-hoc adjustments as negative lines
      for (const adj of dto.adhoc_adjustments) {
        invoiceLines.push({
          tenant_id: tenantId,
          description: adj.label,
          quantity: 1,
          unit_amount: roundMoney(-adj.amount),
          line_total: roundMoney(-adj.amount),
          student_id: null,
          fee_structure_id: null,
          billing_period_start: null,
          billing_period_end: null,
        });
        discountTotal += adj.amount;
      }

      const totalAmount = roundMoney(subtotal - discountTotal);
      const settings = await this.settingsService.getSettings(tenantId);
      const paymentTermDays = settings?.finance?.defaultPaymentTermDays ?? 30;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + paymentTermDays);

      const invoice = await db.invoice.create({
        data: {
          tenant_id: tenantId,
          household_id: household.id,
          invoice_number: invoiceNumber,
          status: 'draft',
          due_date: dueDate,
          subtotal_amount: roundMoney(subtotal),
          discount_amount: roundMoney(discountTotal),
          tax_amount: 0,
          total_amount: totalAmount,
          balance_amount: totalAmount,
          currency_code: tenant?.currency_code ?? 'EUR',
          created_by_user_id: userId,
          lines: { create: invoiceLines },
        },
      });

      return {
        _invoiceId: invoice.id, // internal — used for issuing after commit
        household: {
          id: household.id,
          household_number: householdNumber,
          household_name: household.household_name,
        },
        parents: parents.map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
        })),
        students: createdStudents.map((s) => ({
          id: s.id,
          student_number: s.student_number ?? '',
          first_name: s.first_name,
          last_name: s.last_name,
        })),
        invoice: {
          id: invoice.id,
          invoice_number: invoiceNumber,
          total_amount: totalAmount,
          balance_amount: totalAmount,
          status: invoice.status,
        },
      };
    });

    // ── 8. Issue the invoice AFTER transaction commits ─────────────────
    // InvoicesService.issue() creates its own transaction and respects
    // the tenant's requireApprovalForInvoiceIssue setting.
    const issuedInvoice = await this.invoicesService.issue(
      tenantId,
      result._invoiceId,
      userId,
      true, // hasDirectAuthority — admin is registering directly
    );

    return {
      ...result,
      invoice: {
        ...result.invoice,
        status: issuedInvoice.status ?? 'issued',
      },
    };
  }
}
```

- [ ] **Step 5: Register the module in app.module.ts**

In `apps/api/src/app.module.ts`, import and add `RegistrationModule` to the `imports` array. Follow the existing pattern — find where other modules like `FinanceModule` are imported.

- [ ] **Step 6: Verify API builds**

Run: `cd apps/api && pnpm build`

Expected: No errors.

---

## Task 3: Frontend — Wizard Types

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/types.ts`

- [ ] **Step 1: Create shared wizard types**

```typescript
export interface ParentFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  relationship_label: string;
}

export interface HouseholdFormData {
  household_name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  country: string;
  postal_code: string;
}

export interface EmergencyContactData {
  contact_name: string;
  phone: string;
  relationship_label: string;
}

export interface StudentFormData {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  year_group_id: string;
  national_id: string;
  isComplete: boolean;
}

export interface FeePreviewStudent {
  student_index: number;
  year_group_name: string;
  fees: {
    fee_structure_id: string;
    name: string;
    billing_frequency: string;
    base_amount: number;
    annual_amount: number;
  }[];
  subtotal: number;
}

export interface AvailableDiscount {
  discount_id: string;
  name: string;
  discount_type: 'fixed' | 'percent';
  value: number;
}

export interface FeePreviewResult {
  students: FeePreviewStudent[];
  available_discounts: AvailableDiscount[];
  grand_total: number;
}

export interface RegistrationResult {
  household: { id: string; household_number: string; household_name: string };
  parents: { id: string; first_name: string; last_name: string }[];
  students: { id: string; student_number: string; first_name: string; last_name: string }[];
  invoice: { id: string; invoice_number: string; total_amount: number; balance_amount: number; status: string };
}

export interface PaymentResult {
  id: string;
  amount: number;
  payment_method: string;
  receipt_id?: string;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  primaryParent: ParentFormData;
  secondaryParent: ParentFormData | null;
  showSecondaryParent: boolean;
  household: HouseholdFormData;
  emergencyContacts: EmergencyContactData[];
  students: StudentFormData[];
  expandedStudentIndex: number;
  feePreview: FeePreviewResult | null;
  removedFees: string[];
  appliedDiscounts: { discount_id: string; fee_assignment_index: number }[];
  adhocAdjustments: { label: string; amount: number }[];
  registrationResult: RegistrationResult | null;
  paymentResult: PaymentResult | null;
  isLoading: boolean;
  error: string | null;
}

export type WizardAction =
  | { type: 'SET_STEP'; step: WizardState['step'] }
  | { type: 'SET_PRIMARY_PARENT'; data: Partial<ParentFormData> }
  | { type: 'SET_SECONDARY_PARENT'; data: Partial<ParentFormData> | null }
  | { type: 'TOGGLE_SECONDARY_PARENT' }
  | { type: 'SET_HOUSEHOLD'; data: Partial<HouseholdFormData> }
  | { type: 'SET_EMERGENCY_CONTACTS'; contacts: EmergencyContactData[] }
  | { type: 'ADD_STUDENT' }
  | { type: 'REMOVE_STUDENT'; index: number }
  | { type: 'UPDATE_STUDENT'; index: number; data: Partial<StudentFormData> }
  | { type: 'SET_EXPANDED_STUDENT'; index: number }
  | { type: 'SET_FEE_PREVIEW'; preview: FeePreviewResult }
  | { type: 'REMOVE_FEE'; feeStructureId: string }
  | { type: 'RESTORE_FEE'; feeStructureId: string }
  | { type: 'ADD_DISCOUNT'; discount_id: string; fee_assignment_index: number }
  | { type: 'REMOVE_DISCOUNT'; index: number }
  | { type: 'ADD_ADHOC_ADJUSTMENT'; label: string; amount: number }
  | { type: 'REMOVE_ADHOC_ADJUSTMENT'; index: number }
  | { type: 'SET_REGISTRATION_RESULT'; result: RegistrationResult }
  | { type: 'SET_PAYMENT_RESULT'; result: PaymentResult }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' };
```

---

## Task 4: Frontend — Wizard Shell (Modal + Step Orchestration)

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/registration-wizard.tsx`

- [ ] **Step 1: Create the wizard component with useReducer and modal**

This is the main orchestration component. It:
- Renders a Dialog (90% viewport) triggered by a prop
- Manages state via useReducer
- Renders the current step component
- Handles step navigation and API calls

Key implementation notes:
- Use `Dialog` from `@school/ui` with custom className for 90% sizing: `className="max-w-[90vw] w-[90vw] max-h-[90vh] h-[90vh] overflow-y-auto"`
- Progress bar: 5 segments, filled based on current step
- Back/Next buttons at the bottom of each step
- Step 3 "Confirm & Register" calls `POST /api/v1/registration/family`
- Step 4 "Record Payment" calls existing payment endpoints
- Unsaved data warning on close (window.confirm)

The reducer handles all state transitions. Initial state creates one blank student with `last_name` pre-filled from parent.

---

## Task 5: Frontend — Step 1 (Parent & Household)

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-parent-household.tsx`

- [ ] **Step 1: Build the parent + household + emergency contact form**

This component receives `state` and `dispatch` as props. It renders:

1. **Primary Parent section**: 2-column grid with First Name, Last Name, Email, Phone, Relationship (select). All use `Input` and `Select` from `@school/ui`. Phone and email fields have `dir="ltr"`.

2. **Second Parent section**: Collapsed by default. "+ Add Second Parent / Guardian" dashed border button. When clicked, dispatches `TOGGLE_SECONDARY_PARENT` and shows the same fields.

3. **Household section**: Household Name auto-derived from `primaryParent.last_name + " Family"` — dispatched on last_name change. Address fields in 2-column grid.

4. **Emergency Contact section**: At least one required. Each contact has name, phone (`dir="ltr"`), relationship. "+ Add Another Emergency Contact" button (max 3). Contacts stored as array in state.

5. **Validation**: Inline errors. "Next" disabled until all required fields filled.

RTL rules: Use `ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end` — never physical directional classes.

---

## Task 6: Frontend — Step 2 (Students)

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-students.tsx`

- [ ] **Step 1: Build the student accordion form**

Fetch year groups via `apiClient('/api/v1/year-groups?pageSize=100')` on mount.

Accordion pattern:
- Collapsed: number badge (blue circle), name, year group, gender, DOB, green "Complete" checkmark
- Expanded: 2-column form grid with all fields. Blue border highlight. Student number badge filled.
- Only one expanded at a time — click a collapsed card to expand it (and collapse the current one)
- Last name auto-fills from parent's last name
- Student is "complete" when all required fields are filled

Controls:
- "+ Add Another Student" button dispatches `ADD_STUDENT` (creates blank student with last_name pre-filled)
- Trash icon on collapsed cards dispatches `REMOVE_STUDENT` (disabled if only 1 student)
- "Next" disabled until all students are complete

---

## Task 7: Frontend — Step 3 (Fee Summary)

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-fee-summary.tsx`

- [ ] **Step 1: Build the fee summary with auto-assignment and discounts**

On mount (or when entering step 3), call the preview-fees API:
```typescript
const res = await apiClient('/api/v1/registration/family/preview-fees', {
  method: 'POST',
  body: JSON.stringify({
    students: state.students.map((s) => ({ year_group_id: s.year_group_id })),
  }),
});
dispatch({ type: 'SET_FEE_PREVIEW', preview: res });
```

Display:
- Per-student sections with fee lines (filtered by `removedFees`)
- Each line has amount + remove (✕) button
- Per-student subtotal
- Discounts section:
  - List of applied discounts with remove button
  - Select dropdown of `available_discounts` + "Apply" button
  - Ad-hoc adjustment: label input + amount input + "Add" button
- Grand total banner (dark background, large font)
- "Confirm & Register" green button

On "Confirm & Register":
1. Set loading state
2. Build the `FamilyRegistrationDto` from wizard state
3. Call `POST /api/v1/registration/family`
4. On success: dispatch `SET_REGISTRATION_RESULT` and advance to step 4
5. On error: show toast, stay on step 3

---

## Task 8: Frontend — Step 4 (Payment)

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-payment.tsx`

- [ ] **Step 1: Build the optional payment form**

Shows success banner from registration result.

Payment form (only visible if invoice was issued, not pending_approval):
- Amount input (defaults to invoice total, LTR)
- Payment method select: Cash, Bank Transfer, Card (Manual), Stripe
- Reference input (auto-filled with `REG-{household_number}`, editable, LTR)
- Date received (defaults to today, LTR)

Balance calculation display (updates as amount changes):
```
Invoice Total:      €X,XXX.XX
This Payment:      -€X,XXX.XX
Remaining Balance:  €X,XXX.XX
```

On "Record Payment":
1. Call `POST /api/v1/finance/payments` with manual payment data
2. Call `POST /api/v1/finance/payments/:id/allocations` to allocate to the invoice
3. Dispatch `SET_PAYMENT_RESULT`
4. Advance to step 5

"Skip — No Payment" button advances to step 5 directly.

If invoice is `pending_approval`, show a note: "Invoice is pending approval. Payment can be recorded after approval." and only show "Skip" button.

**Email notification**: After payment is recorded and allocated, dispatch a receipt email to the billing parent's email via the existing notification queue (`notifications:dispatch` BullMQ job). This is fire-and-forget — the wizard does not wait for email delivery. If no email is on file, skip silently. The existing `ReceiptsService` already handles PDF generation for the attachment.

---

## Task 9: Frontend — Step 5 (Complete)

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-complete.tsx`

- [ ] **Step 1: Build the completion screen**

Large success icon + heading + summary line.

Summary table showing: household (with number), students (with numbers), annual fees, payment recorded (if any), outstanding balance.

Email confirmation line (if billing parent had email).

Two print buttons side by side:
- "Print Receipt" — `window.open(`/api/v1/finance/receipts/${receiptId}/pdf`, '_blank')` — only shown if payment was recorded
- "Print Statement" — `window.open(`/api/v1/finance/statements/${householdId}/pdf`, '_blank')`

"Done — Close Wizard" button dispatches `RESET` and calls `onClose()`.

---

## Task 10: Sidebar Integration

**Files:**
- Modify: `apps/web/src/app/[locale]/(school)/layout.tsx`

- [ ] **Step 1: Add Register Family button to sidebar**

In the school layout's sidebar content (inside `sidebarContent()` function), add a "Register Family" button at the top, before the navigation sections:

The layout uses role-based gating via `userRoleKeys` and `ADMIN_ROLES` constants (not permission-based). Follow the same pattern:

```tsx
{/* Register Family — visible to school_owner / school_admin only */}
{userRoleKeys.some((r) => ADMIN_ROLES.includes(r as RoleKey)) && (
  <div className="px-3 mb-2">
    <Button
      onClick={() => setWizardOpen(true)}
      className="w-full justify-start gap-2"
    >
      <Plus className="h-4 w-4" />
      {t('nav.registerFamily')}
    </Button>
  </div>
)}
```

Add `RegistrationWizard` modal at the bottom of the layout:
```tsx
<RegistrationWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
```

Add the state: `const [wizardOpen, setWizardOpen] = useState(false);`

`userRoleKeys` and `ADMIN_ROLES` already exist in the layout file — reuse them.

---

## Task 11: Translation Keys

**Files:**
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/ar.json`

- [ ] **Step 1: Add all registration wizard translation keys**

Add a `"registration"` section to both translation files with keys for:

- Wizard title, step labels, button labels (Next, Back, Cancel, Confirm & Register, Record Payment, Skip, Done)
- Step 1: Primary Parent, Second Parent, Household, Emergency Contact, field labels
- Step 2: Students, Add Another Student, student field labels
- Step 3: Fee Summary, annual fees description, Remove, Discounts, Add Custom Discount, Annual Total, Confirm & Register
- Step 4: Payment, payment field labels, balance display labels, Skip No Payment
- Step 5: Registration Complete, summary labels, Print Receipt, Print Statement, Done Close Wizard
- Sidebar: Register Family button label
- Error messages

---

## Task 12: Build Verification & Smoke Test

- [ ] **Step 1: Type-check both projects**

```bash
cd /path/to/project && npx tsc --noEmit --project apps/api/tsconfig.json
cd /path/to/project && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: No errors in either project.

- [ ] **Step 2: Run existing tests to verify no regressions**

```bash
cd apps/api && pnpm test 2>&1 | tail -20
```

Expected: All existing tests pass.

- [ ] **Step 3: Manual smoke test**

1. Log in as school_owner
2. Verify "Register Family" button appears in sidebar
3. Click it — wizard modal opens at 90% viewport
4. Fill Step 1 (parent, household, emergency contact) — verify "Next" enables
5. Fill Step 2 (add 2 students) — verify accordion works
6. Verify Step 3 shows correct fees from year groups
7. Add a discount, verify total updates
8. Click "Confirm & Register" — verify records created
9. Record a payment — verify receipt generated
10. Click "Print Receipt" — verify PDF opens in new tab
11. Click "Done" — verify wizard closes

---

## Execution Notes

- All database operations use interactive Prisma transactions with RLS (`createRlsClient` + `$transaction(async (tx) => {})`)
- Never use sequential transaction API (`$transaction([...])`)
- All monetary calculations use `roundMoney()` helper
- All directional CSS uses logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`)
- All user-facing strings use `useTranslations()` / translation keys
- LTR enforcement on: email, phone, amounts, dates, reference numbers
- The wizard state resets completely when the modal closes
