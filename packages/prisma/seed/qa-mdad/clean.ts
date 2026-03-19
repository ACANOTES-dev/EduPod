import { PrismaClient } from '@prisma/client';

/**
 * Wipe all tenant-scoped data for the MDAD tenant.
 * Deletes in reverse dependency order to respect foreign keys.
 * Preserves: tenant config, users, memberships, roles, permissions.
 */
export async function cleanMdadData(prisma: PrismaClient, tenantId: string): Promise<void> {
  console.log('  Cleaning existing MDAD tenant data...');

  const t = { tenant_id: tenantId };

  // Phase 8: Audit, Compliance, Search
  await prisma.searchIndexStatus.deleteMany({ where: t });
  await prisma.importJob.deleteMany({ where: t });
  await prisma.complianceRequest.deleteMany({ where: t });
  await prisma.auditLog.deleteMany({ where: t });

  // Phase 7: Communications
  await prisma.contactFormSubmission.deleteMany({ where: t });
  await prisma.websitePage.deleteMany({ where: t });
  await prisma.parentInquiryMessage.deleteMany({ where: t });
  await prisma.parentInquiry.deleteMany({ where: t });
  await prisma.notification.deleteMany({ where: t });
  await prisma.announcement.deleteMany({ where: t });

  // Phase 6B: Payroll
  await prisma.payslip.deleteMany({ where: t });
  await prisma.payrollEntry.deleteMany({ where: t });
  await prisma.payrollRun.deleteMany({ where: t });
  await prisma.staffCompensation.deleteMany({ where: t });

  // Phase 6: Finance
  await prisma.refund.deleteMany({ where: t });
  await prisma.receipt.deleteMany({ where: t });
  await prisma.paymentAllocation.deleteMany({ where: t });
  await prisma.payment.deleteMany({ where: t });
  await prisma.installment.deleteMany({ where: t });
  await prisma.invoiceLine.deleteMany({ where: t });
  await prisma.invoice.deleteMany({ where: t });
  await prisma.householdFeeAssignment.deleteMany({ where: t });
  await prisma.discount.deleteMany({ where: t });
  await prisma.feeStructure.deleteMany({ where: t });

  // Phase 5: Gradebook
  await prisma.reportCard.deleteMany({ where: t });
  await prisma.periodGradeSnapshot.deleteMany({ where: t });
  await prisma.grade.deleteMany({ where: t });
  await prisma.assessment.deleteMany({ where: t });
  await prisma.classSubjectGradeConfig.deleteMany({ where: t });
  await prisma.assessmentCategory.deleteMany({ where: t });
  await prisma.gradingScale.deleteMany({ where: t });

  // Phase 4B: Scheduling config
  await prisma.roomClosure.deleteMany({ where: t });
  await prisma.teacherSchedulingConfig.deleteMany({ where: t });
  await prisma.breakGroupYearGroup.deleteMany({ where: t });
  await prisma.breakGroup.deleteMany({ where: t });
  await prisma.teacherCompetency.deleteMany({ where: t });
  await prisma.curriculumRequirement.deleteMany({ where: t });
  await prisma.schedulingRun.deleteMany({ where: t });
  await prisma.staffSchedulingPreference.deleteMany({ where: t });
  await prisma.staffAvailability.deleteMany({ where: t });
  await prisma.classSchedulingRequirement.deleteMany({ where: t });
  await prisma.schedulePeriodTemplate.deleteMany({ where: t });

  // Phase 4A: Attendance, Schedules, Rooms, Closures
  await prisma.dailyAttendanceSummary.deleteMany({ where: t });
  await prisma.attendanceRecord.deleteMany({ where: t });
  await prisma.attendanceSession.deleteMany({ where: t });
  await prisma.schoolClosure.deleteMany({ where: t });
  await prisma.schedule.deleteMany({ where: t });
  await prisma.room.deleteMany({ where: t });

  // Phase 3: Admissions
  await prisma.applicationNote.deleteMany({ where: t });
  await prisma.application.deleteMany({ where: t });
  await prisma.admissionFormField.deleteMany({ where: t });
  await prisma.admissionFormDefinition.deleteMany({ where: t });

  // Approvals
  await prisma.approvalRequest.deleteMany({ where: t });
  await prisma.approvalWorkflow.deleteMany({ where: t });

  // Phase 2: Core entities (reverse dependency)
  await prisma.classEnrolment.deleteMany({ where: t });
  await prisma.classStaff.deleteMany({ where: t });
  await prisma.class.deleteMany({ where: t });
  await prisma.studentParent.deleteMany({ where: t });
  await prisma.householdParent.deleteMany({ where: t });
  await prisma.parent.deleteMany({ where: t });
  await prisma.student.deleteMany({ where: t });
  await prisma.householdEmergencyContact.deleteMany({ where: t });
  await prisma.household.deleteMany({ where: t });
  await prisma.staffProfile.deleteMany({ where: t });
  await prisma.subject.deleteMany({ where: t });
  await prisma.yearGroup.deleteMany({ where: t });
  await prisma.academicPeriod.deleteMany({ where: t });
  await prisma.academicYear.deleteMany({ where: t });

  // UI preferences
  await prisma.userUiPreference.deleteMany({ where: t });

  // Delete QA users (not the 4 original dev users)
  // We identify QA users by email pattern: *.staff@mdad.test or *.parent@mdad.test
  const qaUsers = await prisma.user.findMany({
    where: {
      email: { contains: '@mdad.test' },
      NOT: {
        email: { in: ['owner@mdad.test', 'admin@mdad.test', 'teacher@mdad.test', 'parent@mdad.test'] },
      },
    },
    select: { id: true },
  });

  if (qaUsers.length > 0) {
    const qaUserIds = qaUsers.map((u) => u.id);
    // Delete membership roles for QA users
    const qaMemberships = await prisma.tenantMembership.findMany({
      where: { tenant_id: tenantId, user_id: { in: qaUserIds } },
      select: { id: true },
    });
    if (qaMemberships.length > 0) {
      await prisma.membershipRole.deleteMany({
        where: { membership_id: { in: qaMemberships.map((m) => m.id) } },
      });
      await prisma.tenantMembership.deleteMany({
        where: { id: { in: qaMemberships.map((m) => m.id) } },
      });
    }
    await prisma.user.deleteMany({ where: { id: { in: qaUserIds } } });
  }

  console.log(`  Cleaned all MDAD data. Removed ${qaUsers.length} QA user accounts.`);
}
