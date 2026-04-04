import { existsSync } from 'fs';
import { Socket } from 'net';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClamScanResult {
  clean: boolean;
  virus_name: string | null;
  error: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_SOCKET_PATH = '/var/run/clamav/clamd.ctl';
const DEFAULT_TIMEOUT_MS = 10_000;
const CHUNK_SIZE = 4096; // 4KB — standard ClamAV INSTREAM chunk size

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ClamavScannerService {
  private readonly logger = new Logger(ClamavScannerService.name);
  private readonly socketPath: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.socketPath = this.configService.get<string>('CLAMAV_SOCKET_PATH', DEFAULT_SOCKET_PATH);
    this.timeoutMs = this.configService.get<number>('CLAMAV_SCAN_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Check whether the ClamAV daemon socket file exists on disk.
   * This does NOT verify that the daemon is accepting connections.
   */
  isAvailable(): boolean {
    return existsSync(this.socketPath);
  }

  /**
   * Scan a buffer using the ClamAV INSTREAM protocol over a unix socket.
   *
   * Protocol:
   *   1. Send `zINSTREAM\0`
   *   2. Send file data in chunks: [4-byte big-endian length][chunk bytes]
   *   3. Send terminator: [4 zero bytes]
   *   4. Read response until socket closes
   *
   * Response:
   *   - `stream: OK\0`              -> clean
   *   - `stream: <name> FOUND\0`    -> infected
   */
  async scanBuffer(buffer: Buffer): Promise<ClamScanResult> {
    if (!this.isAvailable()) {
      this.logger.warn(`ClamAV socket not found at ${this.socketPath}`);
      return { clean: false, virus_name: null, error: `Socket not found: ${this.socketPath}` };
    }

    return new Promise<ClamScanResult>((resolve) => {
      const socket = new Socket();
      const responseChunks: Buffer[] = [];
      let settled = false;

      const finish = (result: ClamScanResult): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      // ─── Timeout ──────────────────────────────────────────────────

      socket.setTimeout(this.timeoutMs);

      socket.on('timeout', () => {
        this.logger.error(`ClamAV scan timed out after ${this.timeoutMs}ms`);
        finish({
          clean: false,
          virus_name: null,
          error: `Scan timed out after ${this.timeoutMs}ms`,
        });
      });

      // ─── Error handling ───────────────────────────────────────────

      socket.on('error', (err: Error) => {
        this.logger.error(`ClamAV socket error: ${err.message}`);
        finish({ clean: false, virus_name: null, error: `Socket error: ${err.message}` });
      });

      // ─── Collect response data ────────────────────────────────────

      socket.on('data', (chunk: Buffer) => {
        responseChunks.push(chunk);
      });

      // ─── Parse response on close ─────────────────────────────────

      socket.on('close', () => {
        if (settled) return;

        const raw = Buffer.concat(responseChunks).toString('utf8').trim().replace(/\0/g, '');

        if (!raw) {
          this.logger.error('ClamAV returned empty response');
          finish({ clean: false, virus_name: null, error: 'Empty response from ClamAV' });
          return;
        }

        finish(this.parseResponse(raw));
      });

      // ─── Connect and send INSTREAM ────────────────────────────────

      socket.connect(this.socketPath, () => {
        try {
          this.sendInstream(socket, buffer);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error during INSTREAM send';
          this.logger.error(`Failed to send INSTREAM data: ${message}`);
          finish({ clean: false, virus_name: null, error: `INSTREAM send failed: ${message}` });
        }
      });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  /**
   * Send the INSTREAM command followed by chunked file data and the
   * zero-length terminator.
   */
  private sendInstream(socket: Socket, buffer: Buffer): void {
    // 1. Send the INSTREAM command (null-terminated)
    const command = Buffer.from('zINSTREAM\0', 'utf8');
    socket.write(command);

    // 2. Send file data in 4KB chunks with 4-byte big-endian length prefix
    let offset = 0;
    while (offset < buffer.length) {
      const end = Math.min(offset + CHUNK_SIZE, buffer.length);
      const chunk = buffer.subarray(offset, end);
      const lengthPrefix = Buffer.alloc(4);
      lengthPrefix.writeUInt32BE(chunk.length, 0);

      socket.write(lengthPrefix);
      socket.write(chunk);

      offset = end;
    }

    // 3. Send zero-length terminator to signal end of stream
    const terminator = Buffer.alloc(4, 0);
    socket.write(terminator);
  }

  /**
   * Parse the ClamAV response string into a structured result.
   *
   * Expected formats:
   *   - "stream: OK"                -> clean
   *   - "stream: Eicar-Test FOUND"  -> infected with virus name
   */
  private parseResponse(raw: string): ClamScanResult {
    // Normalise: response may or may not have "stream: " prefix
    const normalised = raw.startsWith('stream: ') ? raw.slice('stream: '.length) : raw;

    if (normalised === 'OK') {
      this.logger.log('ClamAV scan result: clean');
      return { clean: true, virus_name: null, error: null };
    }

    if (normalised.endsWith('FOUND')) {
      // Extract virus name: everything before " FOUND"
      const virusName = normalised.slice(0, -' FOUND'.length).trim();
      this.logger.warn(`ClamAV scan result: infected — ${virusName}`);
      return { clean: false, virus_name: virusName, error: null };
    }

    // Unexpected response format
    this.logger.error(`Unexpected ClamAV response: "${raw}"`);
    return { clean: false, virus_name: null, error: `Unexpected response: ${raw}` };
  }
}
