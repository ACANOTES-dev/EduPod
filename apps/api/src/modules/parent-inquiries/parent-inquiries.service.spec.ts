import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ParentInquiriesService } from './parent-inquiries.service';

const TENANT_ID = 'tenant-aaa-111';
const USER_ID = 'user-bbb-222';
const PARENT_ID = 'parent-ccc-333';
const INQUIRY_ID = 'inquiry-ddd-444';
const STUDENT_ID = 'student-eee-555';
const MESSAGE_ID = 'msg-fff-666';

const mockParent = { id: PARENT_ID, tenant_id: TENANT_ID, user_id: USER_ID, first_name: 'Jane', last_name: 'Doe' };

const mockPrisma = {
  parent: { findFirst: jest.fn() },
  parentInquiry: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  parentInquiryMessage: { create: jest.fn() },
  studentParent: { findFirst: jest.fn() },
};

const mockQueue = {
  add: jest.fn(),
};

describe('ParentInquiriesService', () => {
  let service: ParentInquiriesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentInquiriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<ParentInquiriesService>(ParentInquiriesService);
  });

  // ─── create() ──────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create inquiry without student link', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      const createdInquiry = { id: INQUIRY_ID, tenant_id: TENANT_ID, parent_id: PARENT_ID, student_id: null, subject: 'Test', status: 'open' };
      mockPrisma.parentInquiry.create.mockResolvedValue(createdInquiry);
      mockPrisma.parentInquiryMessage.create.mockResolvedValue({ id: MESSAGE_ID });
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.create(TENANT_ID, USER_ID, { subject: 'Test', message: 'Hello' });

      expect(result.status).toBe('open');
      expect(mockPrisma.parentInquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenant_id: TENANT_ID, parent_id: PARENT_ID, status: 'open', student_id: null }),
        }),
      );
      expect(mockPrisma.parentInquiryMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ author_type: 'parent', author_user_id: USER_ID }),
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'communications:inquiry-notification',
        expect.objectContaining({ notify_type: 'admin_notify', tenant_id: TENANT_ID }),
        expect.any(Object),
      );
    });

    it('should create inquiry with valid student link', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.studentParent.findFirst.mockResolvedValue({ id: 'link-1', parent_id: PARENT_ID, student_id: STUDENT_ID });
      const createdInquiry = { id: INQUIRY_ID, tenant_id: TENANT_ID, parent_id: PARENT_ID, student_id: STUDENT_ID, subject: 'About grades', status: 'open' };
      mockPrisma.parentInquiry.create.mockResolvedValue(createdInquiry);
      mockPrisma.parentInquiryMessage.create.mockResolvedValue({ id: MESSAGE_ID });
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.create(TENANT_ID, USER_ID, { subject: 'About grades', message: 'Help', student_id: STUDENT_ID });

      expect(result.student_id).toBe(STUDENT_ID);
      expect(mockPrisma.studentParent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, parent_id: PARENT_ID, student_id: STUDENT_ID },
        }),
      );
    });

    it('should throw when student_id does not belong to parent', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.studentParent.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, { subject: 'Test', message: 'Hello', student_id: STUDENT_ID }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.create(TENANT_ID, USER_ID, { subject: 'Test', message: 'Hello', student_id: STUDENT_ID });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({ code: 'STUDENT_NOT_LINKED' });
      }
    });

    it('edge: should throw when no parent record found for user', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, { subject: 'Test', message: 'Hello' }),
      ).rejects.toThrow(NotFoundException);

      try {
        await service.create(TENANT_ID, USER_ID, { subject: 'Test', message: 'Hello' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({ code: 'PARENT_NOT_FOUND' });
      }
    });
  });

  // ─── addAdminMessage() ─────────────────────────────────────────────

  describe('addAdminMessage()', () => {
    it('should add admin message and auto-transition open to in_progress', async () => {
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, status: 'open' });
      mockPrisma.parentInquiryMessage.create.mockResolvedValue({ id: MESSAGE_ID });
      mockPrisma.parentInquiry.update.mockResolvedValue({ id: INQUIRY_ID, status: 'in_progress' });
      mockQueue.add.mockResolvedValue(undefined);

      await service.addAdminMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'We are looking into it' });

      expect(mockPrisma.parentInquiryMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ author_type: 'admin', inquiry_id: INQUIRY_ID }),
        }),
      );
      expect(mockPrisma.parentInquiry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INQUIRY_ID },
          data: { status: 'in_progress' },
        }),
      );
    });

    it('should add admin message without transition when already in_progress', async () => {
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, status: 'in_progress' });
      mockPrisma.parentInquiryMessage.create.mockResolvedValue({ id: MESSAGE_ID });
      mockQueue.add.mockResolvedValue(undefined);

      await service.addAdminMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Update here' });

      expect(mockPrisma.parentInquiry.update).not.toHaveBeenCalled();
    });

    it('should throw INQUIRY_CLOSED when inquiry is closed', async () => {
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, status: 'closed' });

      await expect(
        service.addAdminMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Late reply' }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.addAdminMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Late reply' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({ code: 'INQUIRY_CLOSED' });
      }
    });

    it('should enqueue parent notification on admin reply', async () => {
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, status: 'in_progress' });
      mockPrisma.parentInquiryMessage.create.mockResolvedValue({ id: MESSAGE_ID });
      mockQueue.add.mockResolvedValue(undefined);

      await service.addAdminMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Reply' });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'communications:inquiry-notification',
        expect.objectContaining({ notify_type: 'parent_notify', inquiry_id: INQUIRY_ID }),
        expect.any(Object),
      );
    });
  });

  // ─── addParentMessage() ────────────────────────────────────────────

  describe('addParentMessage()', () => {
    it('should add parent message when inquiry is open', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, parent_id: PARENT_ID, status: 'open' });
      mockPrisma.parentInquiryMessage.create.mockResolvedValue({ id: MESSAGE_ID });
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.addParentMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Follow up' });

      expect(result).toEqual({ id: MESSAGE_ID });
      expect(mockPrisma.parentInquiryMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ author_type: 'parent', author_user_id: USER_ID }),
        }),
      );
    });

    it('should add parent message when inquiry is in_progress', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, parent_id: PARENT_ID, status: 'in_progress' });
      mockPrisma.parentInquiryMessage.create.mockResolvedValue({ id: MESSAGE_ID });
      mockQueue.add.mockResolvedValue(undefined);

      await expect(
        service.addParentMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'More info' }),
      ).resolves.toBeDefined();
    });

    it('should throw INQUIRY_CLOSED for closed inquiry', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, parent_id: PARENT_ID, status: 'closed' });

      await expect(
        service.addParentMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Reopen?' }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.addParentMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Reopen?' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({ code: 'INQUIRY_CLOSED' });
      }
    });

    it('should throw when parent does not own inquiry', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.parentInquiry.findFirst.mockResolvedValue(null);

      await expect(
        service.addParentMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Sneaky' }),
      ).rejects.toThrow(NotFoundException);

      try {
        await service.addParentMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Sneaky' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({ code: 'INQUIRY_NOT_FOUND' });
      }
    });

    it('should enqueue admin notification on parent reply', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, parent_id: PARENT_ID, status: 'open' });
      mockPrisma.parentInquiryMessage.create.mockResolvedValue({ id: MESSAGE_ID });
      mockQueue.add.mockResolvedValue(undefined);

      await service.addParentMessage(TENANT_ID, USER_ID, INQUIRY_ID, { message: 'Reply' });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'communications:inquiry-notification',
        expect.objectContaining({ notify_type: 'admin_notify', inquiry_id: INQUIRY_ID }),
        expect.any(Object),
      );
    });
  });

  // ─── close() ───────────────────────────────────────────────────────

  describe('close()', () => {
    it('should close open inquiry', async () => {
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, status: 'open' });
      mockPrisma.parentInquiry.update.mockResolvedValue({ id: INQUIRY_ID, status: 'closed' });

      const result = await service.close(TENANT_ID, INQUIRY_ID);

      expect(result.status).toBe('closed');
      expect(mockPrisma.parentInquiry.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INQUIRY_ID }, data: { status: 'closed' } }),
      );
    });

    it('should close in_progress inquiry', async () => {
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, status: 'in_progress' });
      mockPrisma.parentInquiry.update.mockResolvedValue({ id: INQUIRY_ID, status: 'closed' });

      const result = await service.close(TENANT_ID, INQUIRY_ID);

      expect(result.status).toBe('closed');
    });

    it('edge: should throw when closing already closed inquiry', async () => {
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({ id: INQUIRY_ID, tenant_id: TENANT_ID, status: 'closed' });

      await expect(service.close(TENANT_ID, INQUIRY_ID)).rejects.toThrow(BadRequestException);

      try {
        await service.close(TENANT_ID, INQUIRY_ID);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({ code: 'ALREADY_CLOSED' });
      }
    });
  });

  // ─── getByIdForParent() ────────────────────────────────────────────

  describe('getByIdForParent()', () => {
    it('should replace admin author details with "School Administration"', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({
        id: INQUIRY_ID,
        tenant_id: TENANT_ID,
        parent_id: PARENT_ID,
        messages: [
          {
            id: 'msg-1',
            author_type: 'admin',
            author_user_id: 'admin-user-1',
            author: { id: 'admin-user-1', first_name: 'John', last_name: 'Smith' },
            message: 'Admin reply',
          },
          {
            id: 'msg-2',
            author_type: 'parent',
            author_user_id: USER_ID,
            author: { id: USER_ID, first_name: 'Jane', last_name: 'Doe' },
            message: 'Parent message',
          },
        ],
      });

      const result = await service.getByIdForParent(TENANT_ID, USER_ID, INQUIRY_ID);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminMsg = result.messages.find((m: any) => m.id === 'msg-1');
      expect(adminMsg!.author).toEqual({ id: 'admin-user-1', first_name: 'School', last_name: 'Administration' });
    });

    it('should show actual author details for parent messages', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.parentInquiry.findFirst.mockResolvedValue({
        id: INQUIRY_ID,
        tenant_id: TENANT_ID,
        parent_id: PARENT_ID,
        messages: [
          {
            id: 'msg-2',
            author_type: 'parent',
            author_user_id: USER_ID,
            author: { id: USER_ID, first_name: 'Jane', last_name: 'Doe' },
            message: 'Parent message',
          },
        ],
      });

      const result = await service.getByIdForParent(TENANT_ID, USER_ID, INQUIRY_ID);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parentMsg = result.messages.find((m: any) => m.id === 'msg-2');
      expect(parentMsg!.author).toEqual({ id: USER_ID, first_name: 'Jane', last_name: 'Doe' });
    });

    it('should throw when parent tries to access another parent\'s inquiry', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(mockParent);
      mockPrisma.parentInquiry.findFirst.mockResolvedValue(null);

      await expect(
        service.getByIdForParent(TENANT_ID, USER_ID, INQUIRY_ID),
      ).rejects.toThrow(NotFoundException);

      try {
        await service.getByIdForParent(TENANT_ID, USER_ID, INQUIRY_ID);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({ code: 'INQUIRY_NOT_FOUND' });
      }
    });
  });
});
