// Communications Overhaul — Impl 14 ships the architecture-docs update.
// These tests assert that the post-rebuild banners + content land on the six
// architecture documents the rebuild touched. They are intentionally simple
// content-presence checks (not deep parsing) so they survive minor copy edits
// while still catching a missing banner / missing entry / missing section.

import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('Communications Overhaul — architecture docs presence', () => {
  const ARCH_DIR = resolve(__dirname, '../../../docs/architecture');
  const REQUIRED_DOCS = [
    'feature-map.md',
    'module-blast-radius.md',
    'danger-zones.md',
    'state-machines.md',
    'event-job-catalog.md',
    'communication-architecture.md',
  ];

  it.each(REQUIRED_DOCS)('%s contains the rebuild verification banner', async (filename) => {
    const path = resolve(ARCH_DIR, filename);
    const content = await fs.readFile(path, 'utf-8');
    expect(content).toMatch(/2026-04-27/);
  });

  it('feature-map.md mentions the new credential and operational tables', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'feature-map.md'), 'utf-8');
    expect(content).toContain('tenant_email_configs');
    expect(content).toContain('tenant_sms_configs');
    expect(content).toContain('tenant_whatsapp_configs');
    expect(content).toContain('notification_suppression_list');
    expect(content).toContain('tenant_email_domains');
    expect(content).toContain('whatsapp_templates');
    expect(content).toContain('whatsapp_service_windows');
    expect(content).toContain('notification_webhook_events');
  });

  it('feature-map.md mentions the new permissions', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'feature-map.md'), 'utf-8');
    expect(content).toContain('configuration.communications.view');
    expect(content).toContain('configuration.communications.manage');
  });

  it('feature-map.md mentions all four new BullMQ jobs', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'feature-map.md'), 'utf-8');
    expect(content).toContain('comms:domain-verification-refresh');
    expect(content).toContain('comms:whatsapp-template-sync');
    expect(content).toContain('comms:suppression-list-cleanup');
    expect(content).toContain('comms:whatsapp-service-window-cleanup');
  });

  it('module-blast-radius.md keeps the CommunicationsModule entry and references CommsCacheBus', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'module-blast-radius.md'), 'utf-8');
    expect(content).toMatch(/^### CommunicationsModule$/m);
    expect(content).toContain('CommsCacheBus');
  });

  it('danger-zones.md adds the six new DZ-Comms entries', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'danger-zones.md'), 'utf-8');
    expect(content).toContain('Tenant Credential Cache Coherence');
    expect(content).toContain('Mid-Flight `is_enabled` Flip');
    expect(content).toContain('Webhook Signature Trust');
    expect(content).toContain('Suppression List Unbounded Growth');
    expect(content).toContain('WhatsApp Service Window Staleness');
    expect(content).toContain('`.env` Credential Removal Is One-Way');
    // All six follow the DZ-Comms-N naming convention
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(content).toContain(`DZ-Comms-${n}`);
    }
  });

  it('state-machines.md documents the extended notification.status + new machines', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'state-machines.md'), 'utf-8');
    expect(content).toContain('NotificationStatus');
    expect(content).toContain('bounced');
    expect(content).toContain('complained');
    expect(content).toContain('WhatsAppTemplateStatus');
    expect(content).toContain('EmailDomainStatus');
  });

  it('event-job-catalog.md documents the four new cron jobs and webhook flow', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'event-job-catalog.md'), 'utf-8');
    expect(content).toContain('comms:domain-verification-refresh');
    expect(content).toContain('comms:whatsapp-template-sync');
    expect(content).toContain('comms:suppression-list-cleanup');
    expect(content).toContain('comms:whatsapp-service-window-cleanup');
    expect(content).toContain('Inbound Webhook Flow');
    expect(content).toContain('comms:config-changed');
  });

  it('communication-architecture.md status banner flipped to "Implementation complete"', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'communication-architecture.md'), 'utf-8');
    expect(content).toContain('Implementation complete');
    expect(content).toContain('communicationnew/IMPLEMENTATION_LOG.md');
    expect(content).toContain('Appendix A: Historical');
  });

  it('feature-map.md documents module-gating annotations', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'feature-map.md'), 'utf-8');
    const gateableMentions = content.match(/Gateable/g) ?? [];
    expect(gateableMentions.length).toBeGreaterThanOrEqual(20);
    expect(content).toContain('| Gateable |');
    expect(content).toContain('module key `gradebook`');
    expect(content).toContain('deprecated `analytics` module key is not used');
  });

  it('danger-zones.md documents module-gating danger zones', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'danger-zones.md'), 'utf-8');
    expect(content).toContain('DZ-MG-1');
    expect(content).toContain('DZ-MG-2');
    expect(content).toContain('DZ-MG-3');
  });

  it('pre-flight-checklist.md and state-machines.md document module gating checks', async () => {
    const preflight = await fs.readFile(resolve(ARCH_DIR, 'pre-flight-checklist.md'), 'utf-8');
    const stateMachines = await fs.readFile(resolve(ARCH_DIR, 'state-machines.md'), 'utf-8');
    expect(preflight).toContain('Module Gating Check');
    expect(preflight).toContain('DZ-MG-1');
    expect(stateMachines).toContain('tenantModule.is_enabled');
    expect(stateMachines).toContain('tenant_modules:invalidated');
  });
});
