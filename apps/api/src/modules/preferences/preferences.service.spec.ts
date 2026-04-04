/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';

jest.mock('../../common/helpers/with-rls', () => ({
  withRls: jest.fn(),
}));

import { withRls } from '../../common/helpers/with-rls';
import { PrismaService } from '../prisma/prisma.service';

import { PreferencesService } from './preferences.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const mockWithRls = withRls as jest.MockedFunction<typeof withRls>;

describe('PreferencesService', () => {
  let service: PreferencesService;
  let mockPrisma: { userUiPreference: { findUnique: jest.Mock; upsert: jest.Mock } };

  beforeEach(async () => {
    mockPrisma = {
      userUiPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ preferences: {} }),
      },
    };

    // Default withRls mock: invoke the callback with a mock tx that delegates to mockPrisma
    mockWithRls.mockImplementation(
      async (
        _prisma: PrismaClient,
        _ctx: { tenant_id: string },
        fn: (tx: PrismaClient) => Promise<unknown>,
      ) => {
        return fn(mockPrisma as unknown as PrismaClient);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [PreferencesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PreferencesService>(PreferencesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getPreferences ───────────────────────────────────────────────────────

  describe('PreferencesService — getPreferences', () => {
    it('should return stored preferences when a record exists', async () => {
      const storedPrefs = { theme: 'dark', sidebar: { collapsed: true } };
      mockPrisma.userUiPreference.findUnique.mockResolvedValue({
        preferences: storedPrefs,
      });

      const result = await service.getPreferences(TENANT_ID, USER_ID);

      expect(result).toEqual(storedPrefs);
      expect(mockWithRls).toHaveBeenCalledWith(
        mockPrisma,
        { tenant_id: TENANT_ID },
        expect.any(Function),
      );
    });

    it('should return empty object when no record exists', async () => {
      mockPrisma.userUiPreference.findUnique.mockResolvedValue(null);

      const result = await service.getPreferences(TENANT_ID, USER_ID);

      expect(result).toEqual({});
    });
  });

  // ─── updatePreferences ────────────────────────────────────────────────────

  describe('PreferencesService — updatePreferences', () => {
    it('should deep merge new data with existing preferences', async () => {
      const existing = { theme: 'dark', sidebar: { collapsed: true, width: 200 } };
      const update = { sidebar: { collapsed: false }, locale: 'ar' };
      const expectedMerged = {
        theme: 'dark',
        sidebar: { collapsed: false, width: 200 },
        locale: 'ar',
      };

      // First withRls call (getPreferences) returns existing record
      // Second withRls call (upsert) returns the merged result
      let callCount = 0;
      mockWithRls.mockImplementation(
        async (
          _prisma: PrismaClient,
          _ctx: { tenant_id: string },
          fn: (tx: PrismaClient) => Promise<unknown>,
        ) => {
          callCount++;
          if (callCount === 1) {
            // getPreferences call
            const mockTx = {
              userUiPreference: {
                findUnique: jest.fn().mockResolvedValue({ preferences: existing }),
              },
            };
            return fn(mockTx as unknown as PrismaClient);
          }
          // updatePreferences upsert call
          const mockTx = {
            userUiPreference: {
              upsert: jest.fn().mockResolvedValue({ preferences: expectedMerged }),
            },
          };
          return fn(mockTx as unknown as PrismaClient);
        },
      );

      const result = await service.updatePreferences(TENANT_ID, USER_ID, update);

      expect(result).toEqual(expectedMerged);
      expect(mockWithRls).toHaveBeenCalledTimes(2);
    });

    it('should create a new record when no preferences exist (upsert)', async () => {
      const newData = { theme: 'light', locale: 'en' };

      // First call (getPreferences): no record
      // Second call (upsert): returns new data
      let callCount = 0;
      mockWithRls.mockImplementation(
        async (
          _prisma: PrismaClient,
          _ctx: { tenant_id: string },
          fn: (tx: PrismaClient) => Promise<unknown>,
        ) => {
          callCount++;
          if (callCount === 1) {
            const mockTx = {
              userUiPreference: {
                findUnique: jest.fn().mockResolvedValue(null),
              },
            };
            return fn(mockTx as unknown as PrismaClient);
          }
          const mockTx = {
            userUiPreference: {
              upsert: jest.fn().mockResolvedValue({ preferences: newData }),
            },
          };
          return fn(mockTx as unknown as PrismaClient);
        },
      );

      const result = await service.updatePreferences(TENANT_ID, USER_ID, newData);

      expect(result).toEqual(newData);
    });

    it('should throw BadRequestException when merged preferences exceed 500 KB', async () => {
      // Create a large payload that exceeds 500 KB once merged
      const largeValue = 'x'.repeat(600 * 1024);
      const largeData = { bigField: largeValue };

      // getPreferences returns empty (no existing)
      let callCount = 0;
      mockWithRls.mockImplementation(
        async (
          _prisma: PrismaClient,
          _ctx: { tenant_id: string },
          fn: (tx: PrismaClient) => Promise<unknown>,
        ) => {
          callCount++;
          if (callCount === 1) {
            const mockTx = {
              userUiPreference: {
                findUnique: jest.fn().mockResolvedValue(null),
              },
            };
            return fn(mockTx as unknown as PrismaClient);
          }
          // Should not reach here — should throw before upsert
          throw new Error('Should not reach upsert');
        },
      );

      await expect(service.updatePreferences(TENANT_ID, USER_ID, largeData)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── deepMerge (tested indirectly through updatePreferences) ──────────────

  describe('PreferencesService — deepMerge behaviour', () => {
    it('should merge nested objects correctly', async () => {
      const existing = {
        dashboard: { widgets: { chart: true, table: false }, layout: 'grid' },
        notifications: { email: true },
      };
      const update = {
        dashboard: { widgets: { table: true, newWidget: true } },
      };
      const expectedMerged = {
        dashboard: { widgets: { chart: true, table: true, newWidget: true }, layout: 'grid' },
        notifications: { email: true },
      };

      let callCount = 0;
      mockWithRls.mockImplementation(
        async (
          _prisma: PrismaClient,
          _ctx: { tenant_id: string },
          fn: (tx: PrismaClient) => Promise<unknown>,
        ) => {
          callCount++;
          if (callCount === 1) {
            const mockTx = {
              userUiPreference: {
                findUnique: jest.fn().mockResolvedValue({ preferences: existing }),
              },
            };
            return fn(mockTx as unknown as PrismaClient);
          }
          // Capture the upsert call to verify merged data
          const upsertMock = jest
            .fn()
            .mockImplementation((args: { update: { preferences: unknown } }) => {
              return Promise.resolve({ preferences: args.update.preferences });
            });
          const mockTx = {
            userUiPreference: { upsert: upsertMock },
          };
          const result = await fn(mockTx as unknown as PrismaClient);
          // Verify the upsert was called with the deep-merged data
          expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
              update: { preferences: expectedMerged },
              create: expect.objectContaining({ preferences: expectedMerged }),
            }),
          );
          return result;
        },
      );

      const result = await service.updatePreferences(TENANT_ID, USER_ID, update);

      expect(result).toEqual(expectedMerged);
    });

    it('should replace arrays instead of merging them', async () => {
      const existing = {
        favorites: ['page-a', 'page-b'],
        settings: { columns: ['name', 'date'] },
      };
      const update = {
        favorites: ['page-c'],
        settings: { columns: ['name', 'date', 'status'] },
      };
      const expectedMerged = {
        favorites: ['page-c'],
        settings: { columns: ['name', 'date', 'status'] },
      };

      let callCount = 0;
      mockWithRls.mockImplementation(
        async (
          _prisma: PrismaClient,
          _ctx: { tenant_id: string },
          fn: (tx: PrismaClient) => Promise<unknown>,
        ) => {
          callCount++;
          if (callCount === 1) {
            const mockTx = {
              userUiPreference: {
                findUnique: jest.fn().mockResolvedValue({ preferences: existing }),
              },
            };
            return fn(mockTx as unknown as PrismaClient);
          }
          const upsertMock = jest
            .fn()
            .mockImplementation((args: { update: { preferences: unknown } }) => {
              return Promise.resolve({ preferences: args.update.preferences });
            });
          const mockTx = {
            userUiPreference: { upsert: upsertMock },
          };
          const result = await fn(mockTx as unknown as PrismaClient);
          expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
              update: { preferences: expectedMerged },
            }),
          );
          return result;
        },
      );

      const result = await service.updatePreferences(TENANT_ID, USER_ID, update);

      expect(result).toEqual(expectedMerged);
    });
  });
});
