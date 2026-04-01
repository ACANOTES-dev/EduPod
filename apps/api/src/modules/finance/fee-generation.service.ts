import { BadRequestException, Injectable } from '@nestjs/common';
import type { FeeGenerationPreview, FeeGenerationPreviewLine } from '@school/shared';
import type { FeeGenerationConfirmDto, FeeGenerationPreviewDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { roundMoney } from './helpers/invoice-status.helper';

@Injectable()
export class FeeGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async preview(tenantId: string, dto: FeeGenerationPreviewDto): Promise<FeeGenerationPreview> {
    // Load active fee assignments for selected fee_structure_ids
    const assignments = await this.prisma.householdFeeAssignment.findMany({
      where: {
        tenant_id: tenantId,
        fee_structure_id: { in: dto.fee_structure_ids },
        effective_to: null, // active only
      },
      include: {
        fee_structure: true,
        discount: true,
        household: {
          select: {
            id: true,
            household_name: true,
            primary_billing_parent_id: true,
          },
        },
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group_id: true,
          },
        },
      },
    });

    // Filter by year groups: either the fee structure's year_group or the student's year_group
    const yearGroupIds = new Set(dto.year_group_ids);
    const filteredAssignments = assignments.filter((a) => {
      // If fee structure has a year_group, it must match
      if (a.fee_structure.year_group_id) {
        return yearGroupIds.has(a.fee_structure.year_group_id);
      }
      // If student has a year_group, it must match
      if (a.student?.year_group_id) {
        return yearGroupIds.has(a.student.year_group_id);
      }
      // If neither has a year_group, include it (household-level assignment)
      return true;
    });

    // Check for existing invoices with same fee structure + period to detect duplicates
    const existingInvoiceLines = await this.prisma.invoiceLine.findMany({
      where: {
        tenant_id: tenantId,
        fee_structure_id: { in: dto.fee_structure_ids },
        billing_period_start: new Date(dto.billing_period_start),
        billing_period_end: new Date(dto.billing_period_end),
        invoice: {
          status: { notIn: ['void', 'cancelled'] },
        },
      },
      select: {
        fee_structure_id: true,
        invoice: {
          select: { household_id: true },
        },
        student_id: true,
      },
    });

    // Build duplicate lookup: key = `${household_id}-${fee_structure_id}-${student_id}`
    const duplicateKeys = new Set<string>();
    for (const line of existingInvoiceLines) {
      const key = `${line.invoice.household_id}-${line.fee_structure_id}-${line.student_id ?? 'null'}`;
      duplicateKeys.add(key);
    }

    const previewLines: FeeGenerationPreviewLine[] = [];
    let duplicatesExcluded = 0;
    let missingBillingParentCount = 0;

    for (const assignment of filteredAssignments) {
      const baseAmount = Number(assignment.fee_structure.amount);
      let discountAmount = 0;
      let discountName: string | null = null;

      if (assignment.discount) {
        discountName = assignment.discount.name;
        if (assignment.discount.discount_type === 'percent') {
          discountAmount = roundMoney((baseAmount * Number(assignment.discount.value)) / 100);
        } else {
          discountAmount = Math.min(Number(assignment.discount.value), baseAmount);
        }
      }

      const lineTotal = roundMoney(baseAmount - discountAmount);
      const dupKey = `${assignment.household_id}-${assignment.fee_structure_id}-${assignment.student_id ?? 'null'}`;
      const isDuplicate = duplicateKeys.has(dupKey);
      const missingBillingParent = !assignment.household.primary_billing_parent_id;

      if (isDuplicate) duplicatesExcluded++;
      if (missingBillingParent) missingBillingParentCount++;

      previewLines.push({
        household_id: assignment.household_id,
        household_name: assignment.household.household_name,
        student_id: assignment.student_id,
        student_name: assignment.student
          ? `${assignment.student.first_name} ${assignment.student.last_name}`
          : null,
        fee_structure_id: assignment.fee_structure_id,
        fee_structure_name: assignment.fee_structure.name,
        base_amount: baseAmount,
        discount_name: discountName,
        discount_amount: discountAmount,
        line_total: lineTotal,
        is_duplicate: isDuplicate,
        missing_billing_parent: missingBillingParent,
      });
    }

    // Compute unique households (non-duplicate lines)
    const uniqueHouseholds = new Set(
      previewLines.filter((l) => !l.is_duplicate).map((l) => l.household_id),
    );

    return {
      preview_lines: previewLines,
      summary: {
        total_households: uniqueHouseholds.size,
        total_lines: previewLines.filter((l) => !l.is_duplicate).length,
        total_amount: roundMoney(
          previewLines.filter((l) => !l.is_duplicate).reduce((sum, l) => sum + l.line_total, 0),
        ),
        duplicates_excluded: duplicatesExcluded,
        missing_billing_parent_count: missingBillingParentCount,
      },
    };
  }

  async confirm(tenantId: string, userId: string, dto: FeeGenerationConfirmDto) {
    // Re-run preview to get current state
    const preview = await this.preview(tenantId, dto);

    // Filter out duplicates, excluded households, and missing billing parents
    const excludedSet = new Set(dto.excluded_household_ids);
    const validLines = preview.preview_lines.filter(
      (l) => !l.is_duplicate && !excludedSet.has(l.household_id) && !l.missing_billing_parent,
    );

    if (validLines.length === 0) {
      throw new BadRequestException({
        code: 'NO_VALID_LINES',
        message: 'No valid invoice lines to generate after exclusions',
      });
    }

    // Group by household
    const householdLineMap = new Map<string, FeeGenerationPreviewLine[]>();
    for (const line of validLines) {
      const existing = householdLineMap.get(line.household_id) ?? [];
      existing.push(line);
      householdLineMap.set(line.household_id, existing);
    }

    // Get tenant currency
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new BadRequestException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    // Get branding for invoice prefix
    const branding = await this.prisma.tenantBranding.findUnique({
      where: { tenant_id: tenantId },
    });
    const invoicePrefix = branding?.invoice_prefix ?? 'INV';

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await rlsClient.$transaction(async (tx) => {
      const prisma = tx as unknown as typeof this.prisma;
      const createdInvoices: Array<{
        id: string;
        invoice_number: string;
        household_id: string;
        total_amount: number;
      }> = [];

      for (const [householdId, lines] of householdLineMap.entries()) {
        const invoiceNumber = await this.sequenceService.nextNumber(
          tenantId,
          'invoice',
          tx,
          invoicePrefix,
        );

        let subtotal = 0;
        const lineData = lines.map((line) => {
          subtotal += line.line_total;
          return {
            tenant_id: tenantId,
            description: `${line.fee_structure_name}${line.student_name ? ` - ${line.student_name}` : ''}`,
            quantity: 1,
            unit_amount: line.base_amount,
            line_total: line.line_total,
            student_id: line.student_id ?? null,
            fee_structure_id: line.fee_structure_id,
            billing_period_start: new Date(dto.billing_period_start),
            billing_period_end: new Date(dto.billing_period_end),
          };
        });
        subtotal = roundMoney(subtotal);
        const discountAmount = roundMoney(lines.reduce((sum, l) => sum + l.discount_amount, 0));

        const invoice = await prisma.invoice.create({
          data: {
            tenant_id: tenantId,
            household_id: householdId,
            invoice_number: invoiceNumber,
            status: 'draft',
            due_date: new Date(dto.due_date),
            subtotal_amount: roundMoney(lines.reduce((sum, l) => sum + l.base_amount, 0)),
            discount_amount: discountAmount,
            total_amount: subtotal,
            balance_amount: subtotal,
            currency_code: tenant.currency_code,
            created_by_user_id: userId,
            lines: {
              create: lineData,
            },
          },
        });

        createdInvoices.push({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          household_id: householdId,
          total_amount: subtotal,
        });
      }

      return {
        invoices_created: createdInvoices.length,
        total_amount: roundMoney(createdInvoices.reduce((sum, inv) => sum + inv.total_amount, 0)),
        invoices: createdInvoices,
      };
    });

    // Write audit log for fee generation run confirmation
    await this.auditLogService.write(
      tenantId,
      userId,
      'fee_generation',
      null,
      'fee_generation_confirm',
      {
        invoices_created: validLines.length,
        total_amount: roundMoney(validLines.reduce((sum, l) => sum + l.line_total, 0)),
        households_affected: new Set(validLines.map((l) => l.household_id)).size,
        fee_structure_ids: dto.fee_structure_ids,
      },
      null,
    );

    return result;
  }
}
