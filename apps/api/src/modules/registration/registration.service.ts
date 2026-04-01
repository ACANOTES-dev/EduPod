import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  AddStudentToHouseholdDto,
  FamilyRegistrationDto,
  PreviewFeesDto,
} from '@school/shared';
import { CONSENT_TYPES, mapConsentCaptureToTypes } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { roundMoney } from '../finance/helpers/invoice-status.helper';
import { InvoicesService } from '../finance/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

export interface RegistrationResult {
  household: { id: string; household_number: string; household_name: string };
  parents: Array<{ id: string; first_name: string; last_name: string }>;
  students: Array<{ id: string; student_number: string; first_name: string; last_name: string }>;
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    balance_amount: number;
    status: string;
  };
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly invoicesService: InvoicesService,
  ) {}

  // ─── Preview Fees ──────────────────────────────────────────────────────────

  async previewFees(tenantId: string, dto: PreviewFeesDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Get term count from active academic year
      const activeYear = await db.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        include: { _count: { select: { periods: true } } },
      });
      const termCount =
        (activeYear as unknown as { _count: { periods: number } } | null)?._count?.periods ?? 3;

      // Collect unique year_group_ids
      const yearGroupIds = [...new Set(dto.students.map((s) => s.year_group_id))];

      // Get all active fee structures matching these year groups (or null = all year groups)
      const feeStructures = await db.feeStructure.findMany({
        where: {
          tenant_id: tenantId,
          active: true,
          OR: [{ year_group_id: { in: yearGroupIds } }, { year_group_id: null }],
        },
        include: {
          year_group: { select: { id: true, name: true } },
        },
      });

      // Get year group names for each student
      const yearGroups = await db.yearGroup.findMany({
        where: { id: { in: yearGroupIds }, tenant_id: tenantId },
        select: { id: true, name: true },
      });
      const yearGroupNameMap = new Map(yearGroups.map((yg) => [yg.id, yg.name]));

      // Build per-student fee data (matching frontend FeePreviewStudent shape)
      let grandTotal = 0;
      const students = dto.students.map((student, index) => {
        const applicableFees = feeStructures
          .filter((fs) => fs.year_group_id === student.year_group_id || fs.year_group_id === null)
          .map((fs) => {
            const baseAmount = Number(fs.amount);
            let annualAmount: number;

            switch (fs.billing_frequency) {
              case 'one_off':
              case 'custom':
                annualAmount = baseAmount;
                break;
              case 'term':
                annualAmount = roundMoney(baseAmount * termCount);
                break;
              case 'monthly':
                annualAmount = roundMoney(baseAmount * 12);
                break;
              default:
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

        const subtotal = applicableFees.reduce((sum, f) => sum + f.annual_amount, 0);
        grandTotal += subtotal;

        return {
          student_index: index,
          year_group_name: yearGroupNameMap.get(student.year_group_id) ?? '',
          fees: applicableFees,
          subtotal: roundMoney(subtotal),
        };
      });

      // Get available discounts
      const discounts = await db.discount.findMany({
        where: { tenant_id: tenantId, active: true },
      });

      const availableDiscounts = discounts.map((d) => ({
        discount_id: d.id,
        name: d.name,
        discount_type: d.discount_type,
        value: Number(d.value),
      }));

      return {
        students,
        available_discounts: availableDiscounts,
        grand_total: roundMoney(grandTotal),
      };
    });
  }

  // ─── Register Family ───────────────────────────────────────────────────────

  async registerFamily(tenantId: string, userId: string, dto: FamilyRegistrationDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // ── 1. Create Household ─────────────────────────────────────────────
      const householdNumber = await this.sequenceService.generateHouseholdReference(tenantId, tx);

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
          needs_completion: false,
        },
      });

      // ── 2. Create Emergency Contacts ────────────────────────────────────
      for (let i = 0; i < dto.emergency_contacts.length; i++) {
        const ec = dto.emergency_contacts[i]!;
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

      // ── 3. Create Primary Parent ────────────────────────────────────────
      // Look up user by email (platform-level table, no RLS)
      let primaryUserId: string | null = null;
      if (dto.primary_parent.email) {
        const user = await this.prisma.user.findUnique({
          where: { email: dto.primary_parent.email },
          select: { id: true },
        });
        if (user) {
          primaryUserId = user.id;
        }
      }

      const primaryParent = await db.parent.create({
        data: {
          tenant_id: tenantId,
          user_id: primaryUserId,
          first_name: dto.primary_parent.first_name,
          last_name: dto.primary_parent.last_name,
          email: dto.primary_parent.email ?? null,
          phone: dto.primary_parent.phone,
          preferred_contact_channels: ['phone'],
          is_primary_contact: true,
          is_billing_contact: true,
          relationship_label: dto.primary_parent.relationship_label,
          status: 'active',
        },
      });

      // ── 4. Create HouseholdParent link for primary parent ───────────────
      await db.householdParent.create({
        data: {
          tenant_id: tenantId,
          household_id: household.id,
          parent_id: primaryParent.id,
          role_label: dto.primary_parent.relationship_label,
        },
      });

      // ── 5. Create Secondary Parent (if provided) ───────────────────────
      let secondaryParent: { id: string } | null = null;
      if (dto.secondary_parent) {
        let secondaryUserId: string | null = null;
        if (dto.secondary_parent.email) {
          const user = await this.prisma.user.findUnique({
            where: { email: dto.secondary_parent.email },
            select: { id: true },
          });
          if (user) {
            secondaryUserId = user.id;
          }
        }

        secondaryParent = await db.parent.create({
          data: {
            tenant_id: tenantId,
            user_id: secondaryUserId,
            first_name: dto.secondary_parent.first_name,
            last_name: dto.secondary_parent.last_name,
            email: dto.secondary_parent.email ?? null,
            phone: dto.secondary_parent.phone ?? null,
            preferred_contact_channels: ['phone'],
            is_primary_contact: false,
            is_billing_contact: false,
            relationship_label: dto.secondary_parent.relationship_label,
            status: 'active',
          },
        });

        await db.householdParent.create({
          data: {
            tenant_id: tenantId,
            household_id: household.id,
            parent_id: secondaryParent.id,
            role_label: dto.secondary_parent.relationship_label,
          },
        });
      }

      // ── 6. Set billing parent on household ──────────────────────────────
      await db.household.update({
        where: { id: household.id },
        data: { primary_billing_parent_id: primaryParent.id },
      });

      // ── 7. Create Students ─────────────────────────────────────────────
      const createdStudents: Array<{
        id: string;
        index: number;
        student_number: string;
        first_name: string;
        last_name: string;
      }> = [];

      for (let i = 0; i < dto.students.length; i++) {
        const s = dto.students[i]!;
        const studentNumber = await this.sequenceService.nextNumber(tenantId, 'student', tx, 'STU');

        const student = await db.student.create({
          data: {
            tenant_id: tenantId,
            household_id: household.id,
            first_name: s.first_name,
            middle_name: s.middle_name ?? null,
            last_name: s.last_name,
            national_id: s.national_id,
            date_of_birth: new Date(s.date_of_birth),
            gender: s.gender as 'male' | 'female' | 'other' | 'prefer_not_to_say',
            year_group_id: s.year_group_id,
            student_number: studentNumber,
            status: 'applicant',
            entry_date: new Date(),
          },
        });

        createdStudents.push({
          id: student.id,
          index: i,
          student_number: studentNumber,
          first_name: s.first_name,
          last_name: s.last_name,
        });

        // ── 8. Create StudentParent links ────────────────────────────────
        await db.studentParent.create({
          data: {
            tenant_id: tenantId,
            student_id: student.id,
            parent_id: primaryParent.id,
            relationship_label: dto.primary_parent.relationship_label,
          },
        });

        if (secondaryParent && dto.secondary_parent) {
          await db.studentParent.create({
            data: {
              tenant_id: tenantId,
              student_id: student.id,
              parent_id: secondaryParent.id,
              relationship_label: dto.secondary_parent.relationship_label,
            },
          });
        }

        const consentTypes = mapConsentCaptureToTypes(dto.consents).filter(
          (consentType) => consentType !== CONSENT_TYPES.WHATSAPP_CHANNEL,
        );

        if (consentTypes.length > 0) {
          await db.consentRecord.createMany({
            data: consentTypes.map((consentType) => ({
              tenant_id: tenantId,
              subject_type: 'student',
              subject_id: student.id,
              consent_type: consentType,
              status: 'granted',
              granted_by_user_id: userId,
              evidence_type: 'registration_form',
              privacy_notice_version_id: null,
              notes: null,
            })),
          });
        }
      }

      if (dto.consents.whatsapp_channel) {
        await db.consentRecord.create({
          data: {
            tenant_id: tenantId,
            subject_type: 'parent',
            subject_id: primaryParent.id,
            consent_type: CONSENT_TYPES.WHATSAPP_CHANNEL,
            status: 'granted',
            granted_by_user_id: userId,
            evidence_type: 'registration_form',
            privacy_notice_version_id: null,
            notes: null,
          },
        });
      }

      // ── 9. Create HouseholdFeeAssignment records ───────────────────────
      const today = new Date();
      const feeAssignmentMap: Map<
        number,
        Array<{ feeAssignmentId: string; feeStructureId: string; studentId: string }>
      > = new Map();

      for (let faIdx = 0; faIdx < dto.fee_assignments.length; faIdx++) {
        const fa = dto.fee_assignments[faIdx]!;
        const studentEntry = createdStudents.find((cs) => cs.index === fa.student_index);
        if (!studentEntry) {
          throw new BadRequestException({
            code: 'INVALID_STUDENT_INDEX',
            message: `Invalid student_index ${fa.student_index} in fee_assignments`,
          });
        }

        // Check if any applied discount targets this fee assignment
        const matchingDiscount = dto.applied_discounts.find(
          (ad) => ad.fee_assignment_index === faIdx,
        );

        const assignment = await db.householdFeeAssignment.create({
          data: {
            tenant_id: tenantId,
            household_id: household.id,
            student_id: studentEntry.id,
            fee_structure_id: fa.fee_structure_id,
            discount_id: matchingDiscount?.discount_id ?? null,
            effective_from: today,
          },
        });

        if (!feeAssignmentMap.has(faIdx)) {
          feeAssignmentMap.set(faIdx, []);
        }
        feeAssignmentMap.get(faIdx)!.push({
          feeAssignmentId: assignment.id,
          feeStructureId: fa.fee_structure_id,
          studentId: studentEntry.id,
        });
      }

      // ── 10. Build Invoice ──────────────────────────────────────────────
      // Get tenant for currency
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
      });
      if (!tenant) {
        throw new NotFoundException({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
      }

      // Get branding for invoice prefix
      const branding = await db.tenantBranding.findUnique({
        where: { tenant_id: tenantId },
      });
      const invoicePrefix = branding?.invoice_prefix ?? 'INV';

      // Generate invoice number
      const invoiceNumber = await this.sequenceService.nextNumber(
        tenantId,
        'invoice',
        tx,
        invoicePrefix,
      );

      // Get term count for annual amount calculation
      const activeYear = await db.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        include: { _count: { select: { periods: true } } },
      });
      const termCount =
        (activeYear as unknown as { _count: { periods: number } } | null)?._count?.periods ?? 3;

      // Build invoice lines
      const lineData: Array<{
        tenant_id: string;
        description: string;
        quantity: number;
        unit_amount: number;
        line_total: number;
        student_id: string | null;
        fee_structure_id: string | null;
      }> = [];

      let subtotal = 0;
      let totalDiscountAmount = 0;

      // For each fee assignment, create positive fee line and (if applicable) negative discount line
      for (let faIdx = 0; faIdx < dto.fee_assignments.length; faIdx++) {
        const fa = dto.fee_assignments[faIdx]!;
        const studentEntry = createdStudents.find((cs) => cs.index === fa.student_index)!;

        // Look up the fee structure
        const feeStructure = await db.feeStructure.findFirst({
          where: { id: fa.fee_structure_id, tenant_id: tenantId },
        });

        if (!feeStructure) {
          throw new BadRequestException({
            code: 'FEE_STRUCTURE_NOT_FOUND',
            message: `Fee structure with id "${fa.fee_structure_id}" not found`,
          });
        }

        // Calculate annual amount
        const baseAmount = Number(feeStructure.amount);
        let annualAmount: number;
        switch (feeStructure.billing_frequency) {
          case 'one_off':
          case 'custom':
            annualAmount = baseAmount;
            break;
          case 'term':
            annualAmount = roundMoney(baseAmount * termCount);
            break;
          case 'monthly':
            annualAmount = roundMoney(baseAmount * 12);
            break;
          default:
            annualAmount = baseAmount;
        }

        // Add positive fee line
        const lineTotal = roundMoney(annualAmount);
        lineData.push({
          tenant_id: tenantId,
          description: `${feeStructure.name} — ${dto.students[fa.student_index]!.first_name} ${dto.students[fa.student_index]!.last_name}`,
          quantity: 1,
          unit_amount: lineTotal,
          line_total: lineTotal,
          student_id: studentEntry.id,
          fee_structure_id: feeStructure.id,
        });
        subtotal += lineTotal;

        // Check for discount on this fee assignment
        const matchingDiscount = dto.applied_discounts.find(
          (ad) => ad.fee_assignment_index === faIdx,
        );
        if (matchingDiscount) {
          const discount = await db.discount.findFirst({
            where: { id: matchingDiscount.discount_id, tenant_id: tenantId },
          });

          if (discount) {
            let discountAmount: number;
            if (discount.discount_type === 'fixed') {
              discountAmount = roundMoney(Number(discount.value));
            } else {
              // percent
              discountAmount = roundMoney((Number(discount.value) / 100) * lineTotal);
            }

            lineData.push({
              tenant_id: tenantId,
              description: `Discount: ${discount.name} — ${dto.students[fa.student_index]!.first_name} ${dto.students[fa.student_index]!.last_name}`,
              quantity: 1,
              unit_amount: -discountAmount,
              line_total: -discountAmount,
              student_id: studentEntry.id,
              fee_structure_id: null,
            });
            totalDiscountAmount += discountAmount;
          }
        }
      }

      // Add ad-hoc adjustments as negative lines
      for (const adj of dto.adhoc_adjustments) {
        const adjAmount = roundMoney(adj.amount);
        lineData.push({
          tenant_id: tenantId,
          description: `Adjustment: ${adj.label}`,
          quantity: 1,
          unit_amount: -adjAmount,
          line_total: -adjAmount,
          student_id: null,
          fee_structure_id: null,
        });
        totalDiscountAmount += adjAmount;
      }

      subtotal = roundMoney(subtotal);
      const totalAmount = roundMoney(subtotal - totalDiscountAmount);
      const balanceAmount = totalAmount;

      // Due date: 30 days from now
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const invoice = await db.invoice.create({
        data: {
          tenant_id: tenantId,
          household_id: household.id,
          invoice_number: invoiceNumber,
          status: 'draft',
          due_date: dueDate,
          subtotal_amount: subtotal,
          discount_amount: totalDiscountAmount,
          total_amount: totalAmount,
          balance_amount: balanceAmount,
          currency_code: tenant.currency_code,
          created_by_user_id: userId,
          lines: {
            create: lineData,
          },
        },
        include: {
          household: { select: { id: true, household_name: true } },
          lines: true,
        },
      });

      const parents: RegistrationResult['parents'] = [
        {
          id: primaryParent.id,
          first_name: dto.primary_parent.first_name,
          last_name: dto.primary_parent.last_name,
        },
      ];
      if (secondaryParent && dto.secondary_parent) {
        parents.push({
          id: secondaryParent.id,
          first_name: dto.secondary_parent.first_name,
          last_name: dto.secondary_parent.last_name,
        });
      }

      return {
        household: {
          id: household.id,
          household_number: householdNumber,
          household_name: dto.household.household_name,
        },
        parents,
        students: createdStudents.map((cs) => ({
          id: cs.id,
          student_number: cs.student_number,
          first_name: cs.first_name,
          last_name: cs.last_name,
        })),
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          total_amount: Number(invoice.total_amount),
          balance_amount: Number(invoice.balance_amount),
          status: invoice.status as string,
        },
      };
    })) as RegistrationResult;

    // ── 11. Issue invoice AFTER transaction commits ─────────────────────
    try {
      const issuedInvoice = await this.invoicesService.issue(
        tenantId,
        result.invoice.id,
        userId,
        true,
      );

      return {
        ...result,
        invoice: {
          ...result.invoice,
          status: (issuedInvoice as { status?: string }).status ?? result.invoice.status,
        },
      };
    } catch {
      this.logger.warn(
        `Invoice issue failed after family registration for tenant ${tenantId}, invoice ${result.invoice.id}. Returning transaction result without issued status.`,
      );
      // If issuing fails (e.g., approval needed), return result with draft/pending status
      return result;
    }
  }

  // ─── Add Student to Existing Household ──────────────────────────────────────

  async addStudentToHousehold(
    tenantId: string,
    userId: string,
    householdId: string,
    dto: AddStudentToHouseholdDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // ── 1. Validate household exists ───────────────────────────────────
      const household = await db.household.findFirst({
        where: { id: householdId, tenant_id: tenantId },
      });
      if (!household) {
        throw new NotFoundException({
          code: 'HOUSEHOLD_NOT_FOUND',
          message: `Household with id "${householdId}" not found`,
        });
      }

      // ── 2. Get all parents linked to this household ────────────────────
      const householdParents = await db.householdParent.findMany({
        where: { household_id: householdId, tenant_id: tenantId },
        include: { parent: true },
      });

      if (householdParents.length === 0) {
        throw new BadRequestException({
          code: 'NO_PARENTS',
          message: 'Cannot add a student to a household with no parents',
        });
      }

      // ── 3. Create student ──────────────────────────────────────────────
      const studentNumber = await this.sequenceService.nextNumber(tenantId, 'student', tx, 'STU');
      const lastName =
        dto.last_name ||
        household.household_name.replace(/^The\s+/i, '').replace(/\s+Family$/i, '');

      const student = await db.student.create({
        data: {
          tenant_id: tenantId,
          household_id: householdId,
          first_name: dto.first_name,
          middle_name: dto.middle_name ?? null,
          last_name: lastName,
          national_id: dto.national_id,
          date_of_birth: new Date(dto.date_of_birth),
          gender: dto.gender as 'male' | 'female' | 'other' | 'prefer_not_to_say',
          year_group_id: dto.year_group_id,
          student_number: studentNumber,
          nationality: dto.nationality ?? null,
          city_of_birth: dto.city_of_birth ?? null,
          status: 'applicant',
          entry_date: new Date(),
        },
      });

      // ── 4. Link student to all household parents ───────────────────────
      for (const hp of householdParents) {
        await db.studentParent.create({
          data: {
            tenant_id: tenantId,
            student_id: student.id,
            parent_id: hp.parent_id,
            relationship_label: hp.role_label ?? 'Parent',
          },
        });
      }

      // ── 5. Auto-assign fees for this student's year group ──────────────
      const feeStructures = await db.feeStructure.findMany({
        where: {
          tenant_id: tenantId,
          active: true,
          OR: [{ year_group_id: null }, { year_group_id: dto.year_group_id }],
        },
      });

      const today = new Date();
      for (const fs of feeStructures) {
        await db.householdFeeAssignment.create({
          data: {
            tenant_id: tenantId,
            household_id: householdId,
            student_id: student.id,
            fee_structure_id: fs.id,
            effective_from: today,
          },
        });
      }

      // ── 6. Build invoice ───────────────────────────────────────────────
      const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
      }

      const branding = await db.tenantBranding.findUnique({ where: { tenant_id: tenantId } });
      const invoicePrefix = branding?.invoice_prefix ?? 'INV';
      const invoiceNumber = await this.sequenceService.nextNumber(
        tenantId,
        'invoice',
        tx,
        invoicePrefix,
      );

      // Get term count for annual amount calculation
      const activeYear = await db.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        include: { _count: { select: { periods: true } } },
      });
      const termCount =
        (activeYear as unknown as { _count: { periods: number } } | null)?._count?.periods ?? 3;

      const lineData: Array<{
        tenant_id: string;
        description: string;
        quantity: number;
        unit_amount: number;
        line_total: number;
        student_id: string | null;
        fee_structure_id: string | null;
      }> = [];

      let subtotal = 0;

      for (const fs of feeStructures) {
        const baseAmount = Number(fs.amount);
        let annualAmount: number;
        switch (fs.billing_frequency) {
          case 'one_off':
          case 'custom':
            annualAmount = baseAmount;
            break;
          case 'term':
            annualAmount = roundMoney(baseAmount * termCount);
            break;
          case 'monthly':
            annualAmount = roundMoney(baseAmount * 12);
            break;
          default:
            annualAmount = baseAmount;
        }

        const lineTotal = roundMoney(annualAmount);
        lineData.push({
          tenant_id: tenantId,
          description: `${fs.name} — ${dto.first_name} ${lastName}`,
          quantity: 1,
          unit_amount: lineTotal,
          line_total: lineTotal,
          student_id: student.id,
          fee_structure_id: fs.id,
        });
        subtotal += lineTotal;
      }

      subtotal = roundMoney(subtotal);

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const invoice = await db.invoice.create({
        data: {
          tenant_id: tenantId,
          household_id: householdId,
          invoice_number: invoiceNumber,
          status: 'draft',
          due_date: dueDate,
          subtotal_amount: subtotal,
          discount_amount: 0,
          total_amount: subtotal,
          balance_amount: subtotal,
          currency_code: tenant.currency_code,
          created_by_user_id: userId,
          lines: { create: lineData },
        },
      });

      return {
        student: {
          id: student.id,
          student_number: studentNumber,
          first_name: dto.first_name,
          last_name: lastName,
        },
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          total_amount: Number(invoice.total_amount),
          balance_amount: Number(invoice.balance_amount),
          status: invoice.status as string,
        },
      };
    })) as {
      student: { id: string; student_number: string; first_name: string; last_name: string };
      invoice: {
        id: string;
        invoice_number: string;
        total_amount: number;
        balance_amount: number;
        status: string;
      };
    };

    // Issue invoice after transaction commits
    try {
      const issuedInvoice = await this.invoicesService.issue(
        tenantId,
        result.invoice.id,
        userId,
        true,
      );
      return {
        ...result,
        invoice: {
          ...result.invoice,
          status: (issuedInvoice as { status?: string }).status ?? result.invoice.status,
        },
      };
    } catch {
      this.logger.warn(
        `Invoice issue failed after addStudentToHousehold for tenant ${tenantId}, invoice ${result.invoice.id}. Returning transaction result without issued status.`,
      );
      return result;
    }
  }
}
