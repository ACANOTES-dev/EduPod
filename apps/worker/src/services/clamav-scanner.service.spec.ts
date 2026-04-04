/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { existsSync } from 'fs';
import { Socket } from 'net';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('net', () => ({
  Socket: jest.fn(),
}));

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { ClamavScannerService } from './clamav-scanner.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const SOCKET_PATH = '/var/run/clamav/clamd.ctl';
const TIMEOUT_MS = 10000;

// ─── Mock helpers ───────────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;
type HandlerMap = Record<string, EventHandler>;

const mockConfigService = {
  get: jest.fn((key: string, defaultValue: unknown) => {
    if (key === 'CLAMAV_SOCKET_PATH') return SOCKET_PATH;
    if (key === 'CLAMAV_SCAN_TIMEOUT_MS') return TIMEOUT_MS;
    return defaultValue;
  }),
};

interface MockSocket {
  on: jest.Mock;
  connect: jest.Mock;
  write: jest.Mock;
  setTimeout: jest.Mock;
  destroy: jest.Mock;
}

function buildMockSocket(): MockSocket {
  return {
    on: jest.fn(),
    connect: jest.fn(),
    write: jest.fn(),
    setTimeout: jest.fn(),
    destroy: jest.fn(),
  };
}

/** Call an event handler from the captured map, throwing if not registered. */
function emit(handlers: HandlerMap, event: string, ...args: unknown[]): void {
  const handler = handlers[event];
  if (!handler) throw new Error(`No handler registered for event "${event}"`);
  handler(...args);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ClamavScannerService', () => {
  let service: ClamavScannerService;
  let mockSocket: MockSocket;

  beforeEach(async () => {
    mockSocket = buildMockSocket();
    (Socket as unknown as jest.Mock).mockImplementation(() => mockSocket);

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClamavScannerService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<ClamavScannerService>(ClamavScannerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── isAvailable ────────────────────────────────────────────────────────

  describe('isAvailable', () => {
    it('should return true when socket exists', () => {
      (existsSync as jest.Mock).mockReturnValue(true);

      expect(service.isAvailable()).toBe(true);
      expect(existsSync).toHaveBeenCalledWith(SOCKET_PATH);
    });

    it('should return false when socket does not exist', () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      expect(service.isAvailable()).toBe(false);
      expect(existsSync).toHaveBeenCalledWith(SOCKET_PATH);
    });
  });

  // ─── scanBuffer ─────────────────────────────────────────────────────────

  describe('scanBuffer', () => {
    it('should return error when socket not found', async () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      const result = await service.scanBuffer(Buffer.from('test'));

      expect(result).toEqual({
        clean: false,
        virus_name: null,
        error: `Socket not found: ${SOCKET_PATH}`,
      });
    });

    it('should return clean result for OK response', async () => {
      (existsSync as jest.Mock).mockReturnValue(true);

      const handlers: HandlerMap = {};
      mockSocket.on.mockImplementation((event: string, handler: EventHandler) => {
        handlers[event] = handler;
        return mockSocket;
      });
      mockSocket.connect.mockImplementation((_path: string, callback: () => void) => {
        callback();
        emit(handlers, 'data', Buffer.from('stream: OK\0'));
        emit(handlers, 'close');
        return mockSocket;
      });

      const result = await service.scanBuffer(Buffer.from('test'));

      expect(result).toEqual({
        clean: true,
        virus_name: null,
        error: null,
      });
    });

    it('should return infected result for FOUND response', async () => {
      (existsSync as jest.Mock).mockReturnValue(true);

      const handlers: HandlerMap = {};
      mockSocket.on.mockImplementation((event: string, handler: EventHandler) => {
        handlers[event] = handler;
        return mockSocket;
      });
      mockSocket.connect.mockImplementation((_path: string, callback: () => void) => {
        callback();
        emit(handlers, 'data', Buffer.from('stream: Eicar-Test FOUND\0'));
        emit(handlers, 'close');
        return mockSocket;
      });

      const result = await service.scanBuffer(Buffer.from('test'));

      expect(result).toEqual({
        clean: false,
        virus_name: 'Eicar-Test',
        error: null,
      });
    });

    it('should return error on socket error', async () => {
      (existsSync as jest.Mock).mockReturnValue(true);

      const handlers: HandlerMap = {};
      mockSocket.on.mockImplementation((event: string, handler: EventHandler) => {
        handlers[event] = handler;
        return mockSocket;
      });
      mockSocket.connect.mockImplementation(() => {
        emit(handlers, 'error', new Error('Connection refused'));
        return mockSocket;
      });

      const result = await service.scanBuffer(Buffer.from('test'));

      expect(result).toEqual({
        clean: false,
        virus_name: null,
        error: 'Socket error: Connection refused',
      });
    });

    it('should return error on timeout', async () => {
      (existsSync as jest.Mock).mockReturnValue(true);

      const handlers: HandlerMap = {};
      mockSocket.on.mockImplementation((event: string, handler: EventHandler) => {
        handlers[event] = handler;
        return mockSocket;
      });
      mockSocket.connect.mockImplementation(() => {
        emit(handlers, 'timeout');
        return mockSocket;
      });

      const result = await service.scanBuffer(Buffer.from('test'));

      expect(result).toEqual({
        clean: false,
        virus_name: null,
        error: expect.stringContaining('timed out'),
      });
    });

    it('should send INSTREAM protocol data on connect', async () => {
      (existsSync as jest.Mock).mockReturnValue(true);

      const handlers: HandlerMap = {};
      mockSocket.on.mockImplementation((event: string, handler: EventHandler) => {
        handlers[event] = handler;
        return mockSocket;
      });
      mockSocket.connect.mockImplementation((_path: string, callback: () => void) => {
        callback();
        emit(handlers, 'data', Buffer.from('stream: OK\0'));
        emit(handlers, 'close');
        return mockSocket;
      });

      await service.scanBuffer(Buffer.from('hello'));

      // First write: zINSTREAM\0 command
      expect(mockSocket.write).toHaveBeenCalledWith(Buffer.from('zINSTREAM\0', 'utf8'));
      // At least 3 writes: command + length-prefixed chunk + terminator
      expect(mockSocket.write.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should call setTimeout with configured timeout', async () => {
      (existsSync as jest.Mock).mockReturnValue(true);

      const handlers: HandlerMap = {};
      mockSocket.on.mockImplementation((event: string, handler: EventHandler) => {
        handlers[event] = handler;
        return mockSocket;
      });
      mockSocket.connect.mockImplementation((_path: string, callback: () => void) => {
        callback();
        emit(handlers, 'data', Buffer.from('stream: OK\0'));
        emit(handlers, 'close');
        return mockSocket;
      });

      await service.scanBuffer(Buffer.from('test'));

      expect(mockSocket.setTimeout).toHaveBeenCalledWith(TIMEOUT_MS);
    });

    it('should destroy the socket after receiving a result', async () => {
      (existsSync as jest.Mock).mockReturnValue(true);

      const handlers: HandlerMap = {};
      mockSocket.on.mockImplementation((event: string, handler: EventHandler) => {
        handlers[event] = handler;
        return mockSocket;
      });
      mockSocket.connect.mockImplementation((_path: string, callback: () => void) => {
        callback();
        emit(handlers, 'data', Buffer.from('stream: OK\0'));
        emit(handlers, 'close');
        return mockSocket;
      });

      await service.scanBuffer(Buffer.from('test'));

      expect(mockSocket.destroy).toHaveBeenCalled();
    });
  });
});
