import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  type BulkGrantConsentsDto,
  type ConsentEvidenceType,
  type ConsentSubjectType,
  type ConsentType,
  type GetConsentsByTypeQueryDto,
  type ParentPortalConsentItemDto,
  CONSENT_CATEGORIES,
  CONSENT_TYPE_CATEGORY_MAP,
  CONSENT_TYPES,
  STUDENT_PARENT_PORTAL_CONSENT_TYPES,
} from '@school/shared/gdpr';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

type TransactionClient = PrismaService;

type ConsentRecordRow = {
  id: string;
  tenant_id: string;
  subject_type: string;
  subject_id: string;
  consent_type: string;
  status: string;
  granted_at: Date;
  withdrawn_at: Date | null;
  granted_by_user_id: string;
  evidence_type: string;
  privacy_notice_version_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

type StudentPortalSubject = {
  id: string;
  first_name: string;
  last_name: string;
};

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async grantConsent(
    tenantId: string,
    subjectType: ConsentSubjectType,
    subjectId: string,
    consentType: ConsentType,
    grantedByUserId: string,
    evidenceType: ConsentEvidenceType,
    notes?: string | null,
    privacyNoticeVersionId?: string | null,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as TransactionClient;
      await this.assertSubjectExists(db, tenantId, subjectType, subjectId);

      const existingActive = await db.consentRecord.findFirst({
        where: {
          tenant_id: tenantId,
          subject_type: subjectType,
          subject_id: subjectId,
          consent_type: consentType,
          status: 'granted',
        },
      });

      if (existingActive) {
        throw new BadRequestException({
          code: 'CONSENT_ALREADY_GRANTED',
          message: `Consent "${consentType}" is already active for this subject`,
        });
      }

      return db.consentRecord.create({
        data: {
          tenant_id: tenantId,
          subject_type: subjectType,
          subject_id: subjectId,
          consent_type: consentType,
          status: 'granted',
          granted_by_user_id: grantedByUserId,
          evidence_type: evidenceType,
          privacy_notice_version_id: privacyNoticeVersionId ?? null,
          notes: notes ?? null,
        },
      });
    });
  }

  async withdrawConsent(tenantId: string, consentId: string, _withdrawnByUserId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as TransactionClient;
      const consent = await db.consentRecord.findFirst({
        where: { id: consentId, tenant_id: tenantId },
      });

      if (!consent) {
        throw new NotFoundException({
          code: 'CONSENT_NOT_FOUND',
          message: `Consent with id "${consentId}" not found`,
        });
      }

      if (consent.status !== 'granted') {
        throw new BadRequestException({
          code: 'CONSENT_NOT_ACTIVE',
          message: 'Only active consents can be withdrawn',
        });
      }

      return db.consentRecord.update({
        where: { id: consentId },
        data: {
          status: 'withdrawn',
          withdrawn_at: new Date(),
        },
      });
    });
  }

  async hasConsent(
    tenantId: string,
    subjectType: ConsentSubjectType,
    subjectId: string,
    consentType: ConsentType,
  ): Promise<boolean> {
    const record = await this.prisma.consentRecord.findFirst({
      where: {
        tenant_id: tenantId,
        subject_type: subjectType,
        subject_id: subjectId,
        consent_type: consentType,
        status: 'granted',
      },
      select: { id: true },
    });

    return record !== null;
  }

  async getConsentsForSubject(
    tenantId: string,
    subjectType: ConsentSubjectType,
    subjectId: string,
  ) {
    await this.assertSubjectExists(this.prisma, tenantId, subjectType, subjectId);

    return this.prisma.consentRecord.findMany({
      where: {
        tenant_id: tenantId,
        subject_type: subjectType,
        subject_id: subjectId,
      },
      orderBy: [{ granted_at: 'desc' }, { created_at: 'desc' }],
    });
  }

  async getConsentsByType(
    tenantId: string,
    consentType: ConsentType,
    pagination: Pick<GetConsentsByTypeQueryDto, 'page' | 'pageSize'>,
  ) {
    const where = {
      tenant_id: tenantId,
      consent_type: consentType,
    };
    const skip = (pagination.page - 1) * pagination.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.consentRecord.findMany({
        where,
        orderBy: [{ granted_at: 'desc' }, { created_at: 'desc' }],
        skip,
        take: pagination.pageSize,
      }),
      this.prisma.consentRecord.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
      },
    };
  }

  async bulkGrantConsents(
    tenantId: string,
    subjectType: ConsentSubjectType,
    subjectId: string,
    consents: BulkGrantConsentsDto['consents'],
    grantedByUserId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as TransactionClient;
      await this.assertSubjectExists(db, tenantId, subjectType, subjectId);

      const created = [];
      for (const consent of consents) {
        const existingActive = await db.consentRecord.findFirst({
          where: {
            tenant_id: tenantId,
            subject_type: subjectType,
            subject_id: subjectId,
            consent_type: consent.type,
            status: 'granted',
          },
        });

        if (existingActive) {
          throw new BadRequestException({
            code: 'CONSENT_ALREADY_GRANTED',
            message: `Consent "${consent.type}" is already active for this subject`,
          });
        }

        created.push(
          await db.consentRecord.create({
            data: {
              tenant_id: tenantId,
              subject_type: subjectType,
              subject_id: subjectId,
              consent_type: consent.type,
              status: 'granted',
              granted_by_user_id: grantedByUserId,
              evidence_type: consent.evidence_type,
              privacy_notice_version_id: consent.privacy_notice_version_id ?? null,
              notes: consent.notes ?? null,
            },
          }),
        );
      }

      return created;
    });
  }

  async getParentPortalConsents(
    tenantId: string,
    userId: string,
  ): Promise<{ data: ParentPortalConsentItemDto[] }> {
    const parent = await this.prisma.parent.findFirst({
      where: { tenant_id: tenantId, user_id: userId, status: 'active' },
      select: { id: true, first_name: true, last_name: true },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const studentLinks = await this.prisma.studentParent.findMany({
      where: { tenant_id: tenantId, parent_id: parent.id },
      select: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    const students = studentLinks
      .map((link) => link.student)
      .filter((student): student is StudentPortalSubject => student !== null);
    const studentIds = students.map((student) => student.id);

    const studentConsents =
      studentIds.length === 0
        ? []
        : await this.prisma.consentRecord.findMany({
            where: {
              tenant_id: tenantId,
              subject_type: 'student',
              subject_id: { in: studentIds },
              consent_type: { in: [...STUDENT_PARENT_PORTAL_CONSENT_TYPES] },
            },
            orderBy: [{ created_at: 'desc' }],
          });

    const parentConsents = await this.prisma.consentRecord.findMany({
      where: {
        tenant_id: tenantId,
        subject_type: 'parent',
        subject_id: parent.id,
        consent_type: {
          in: [CONSENT_TYPES.WHATSAPP_CHANNEL, CONSENT_TYPES.EMAIL_MARKETING],
        },
      },
      orderBy: [{ created_at: 'desc' }],
    });

    const items: ParentPortalConsentItemDto[] = [];

    for (const student of students) {
      for (const consentType of STUDENT_PARENT_PORTAL_CONSENT_TYPES) {
        const latest = this.findLatestConsent(studentConsents, 'student', student.id, consentType);

        items.push(
          this.mapPortalConsentItem(
            latest,
            'student',
            student.id,
            `${student.first_name} ${student.last_name}`,
            consentType,
          ),
        );
      }
    }

    for (const consentType of [
      CONSENT_TYPES.WHATSAPP_CHANNEL,
      CONSENT_TYPES.EMAIL_MARKETING,
    ] as const) {
      const latest = this.findLatestConsent(parentConsents, 'parent', parent.id, consentType);

      items.push(
        this.mapPortalConsentItem(
          latest,
          'parent',
          parent.id,
          `${parent.first_name} ${parent.last_name}`,
          consentType,
        ),
      );
    }

    items.sort((left, right) => {
      const leftCategory =
        CONSENT_TYPE_CATEGORY_MAP[left.consent_type] ?? CONSENT_CATEGORIES.health;
      const rightCategory =
        CONSENT_TYPE_CATEGORY_MAP[right.consent_type] ?? CONSENT_CATEGORIES.health;

      if (leftCategory !== rightCategory) {
        return leftCategory.localeCompare(rightCategory);
      }

      if (left.subject_name !== right.subject_name) {
        return left.subject_name.localeCompare(right.subject_name);
      }

      return left.consent_type.localeCompare(right.consent_type);
    });

    return { data: items };
  }

  async withdrawParentPortalConsent(tenantId: string, userId: string, consentId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { tenant_id: tenantId, user_id: userId, status: 'active' },
      select: { id: true },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const consent = await this.prisma.consentRecord.findFirst({
      where: { id: consentId, tenant_id: tenantId },
    });

    if (!consent) {
      throw new NotFoundException({
        code: 'CONSENT_NOT_FOUND',
        message: `Consent with id "${consentId}" not found`,
      });
    }

    if (consent.subject_type === 'parent' && consent.subject_id === parent.id) {
      return this.withdrawConsent(tenantId, consentId, userId);
    }

    if (consent.subject_type !== 'student') {
      throw new ForbiddenException({
        code: 'CONSENT_ACCESS_DENIED',
        message: 'You do not have access to this consent record',
      });
    }

    const link = await this.prisma.studentParent.findFirst({
      where: {
        tenant_id: tenantId,
        parent_id: parent.id,
        student_id: consent.subject_id,
      },
      select: { student_id: true },
    });

    if (!link) {
      throw new ForbiddenException({
        code: 'CONSENT_ACCESS_DENIED',
        message: 'You do not have access to this consent record',
      });
    }

    return this.withdrawConsent(tenantId, consentId, userId);
  }

  private async assertSubjectExists(
    db: TransactionClient,
    tenantId: string,
    subjectType: ConsentSubjectType,
    subjectId: string,
  ): Promise<void> {
    const exists = await this.subjectExists(db, tenantId, subjectType, subjectId);

    if (!exists) {
      throw new NotFoundException({
        code: 'CONSENT_SUBJECT_NOT_FOUND',
        message: `Subject "${subjectId}" of type "${subjectType}" was not found`,
      });
    }
  }

  private async subjectExists(
    db: TransactionClient,
    tenantId: string,
    subjectType: ConsentSubjectType,
    subjectId: string,
  ): Promise<boolean> {
    switch (subjectType) {
      case 'student':
        return (
          (await db.student.findFirst({
            where: { id: subjectId, tenant_id: tenantId },
            select: { id: true },
          })) !== null
        );
      case 'parent':
        return (
          (await db.parent.findFirst({
            where: { id: subjectId, tenant_id: tenantId },
            select: { id: true },
          })) !== null
        );
      case 'staff':
        return (
          (await db.staffProfile.findFirst({
            where: { id: subjectId, tenant_id: tenantId },
            select: { id: true },
          })) !== null
        );
      case 'applicant':
        return (
          (await db.application.findFirst({
            where: { id: subjectId, tenant_id: tenantId },
            select: { id: true },
          })) !== null
        );
      default:
        return false;
    }
  }

  private findLatestConsent(
    records: ConsentRecordRow[],
    subjectType: ConsentSubjectType,
    subjectId: string,
    consentType: ConsentType,
  ): ConsentRecordRow | null {
    return (
      records.find(
        (record) =>
          record.subject_type === subjectType &&
          record.subject_id === subjectId &&
          record.consent_type === consentType,
      ) ?? null
    );
  }

  private mapPortalConsentItem(
    record: ConsentRecordRow | null,
    subjectType: ConsentSubjectType,
    subjectId: string,
    subjectName: string,
    consentType: ConsentType,
  ): ParentPortalConsentItemDto {
    return {
      consent_id: record?.id ?? null,
      subject_type: subjectType,
      subject_id: subjectId,
      subject_name: subjectName,
      consent_type: consentType,
      status: (record?.status ?? 'withdrawn') as ParentPortalConsentItemDto['status'],
      granted_at: record?.granted_at?.toISOString() ?? null,
      withdrawn_at: record?.withdrawn_at?.toISOString() ?? null,
      evidence_type: (record?.evidence_type as ParentPortalConsentItemDto['evidence_type']) ?? null,
      notes: record?.notes ?? null,
    };
  }
}
