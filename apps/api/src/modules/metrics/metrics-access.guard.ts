import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Allow `/api/metrics` only from loopback (Prometheus on the same host) or
 * with a known shared-secret header (`X-Metrics-Auth`). Production scrapers
 * configure the token via `METRICS_INTERNAL_TOKEN` env var.
 *
 * If `METRICS_INTERNAL_TOKEN` is not set in dev, loopback alone is allowed
 * — the gate is purely additive over the historical "any IP" exposure.
 */
const ALLOWED_LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

@Injectable()
export class MetricsAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const rawIp = req.ip || req.socket?.remoteAddress || '';
    const ip = rawIp.replace(/^::ffff:/, '');
    if (ALLOWED_LOOPBACK.has(ip) || ALLOWED_LOOPBACK.has(rawIp)) return true;

    const expectedToken = process.env.METRICS_INTERNAL_TOKEN;
    const presented = req.header('x-metrics-auth');
    if (expectedToken && presented && presented === expectedToken) return true;

    return false;
  }
}
