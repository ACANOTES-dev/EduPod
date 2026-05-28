import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const READ_ONLY_ENV_VALUE = '1';
const STATUS_URL = 'https://cutover.edupod.app';

@Injectable()
export class ReadOnlyCutoverMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (process.env.EDUPOD_READ_ONLY_CUTOVER !== READ_ONLY_ENV_VALUE) {
      next();
      return;
    }

    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const host = normaliseEduPodHost(req.headers.host);
    const error: {
      code: 'PLATFORM_IN_READ_ONLY_CUTOVER';
      message: string;
      status_url: string;
      target_url?: string;
    } = {
      code: 'PLATFORM_IN_READ_ONLY_CUTOVER',
      message:
        'EduPod has moved to the Cloudflare platform. Writes are temporarily blocked on this legacy host while DNS finishes updating.',
      status_url: STATUS_URL,
    };

    if (host) {
      error.target_url = `https://${host}`;
    }

    res.setHeader('Retry-After', '60');
    res.status(503).json({ error });
  }
}

export function normaliseEduPodHost(rawHost: string | string[] | undefined): string | null {
  const firstHost = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  if (!firstHost) return null;

  const host = firstHost.trim().toLowerCase().replace(/\.$/, '').replace(/:\d+$/, '');

  if (host === 'edupod.app') return host;
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.edupod\.app$/.test(host)) {
    return host;
  }

  return null;
}
