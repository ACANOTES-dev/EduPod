import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

export type NotificationMessageCatalogue = Record<string, unknown>;

const CATALOGUE_FILE_RE = /^notifications\.([a-z]{2,5})\.json$/;

function candidateMessageDirs(): string[] {
  return [
    join(__dirname, 'messages'),
    resolve(process.cwd(), 'src/notifications/messages'),
    resolve(process.cwd(), 'packages/shared/src/notifications/messages'),
  ];
}

function findMessageDir(): string | null {
  return candidateMessageDirs().find((dir) => existsSync(dir)) ?? null;
}

function loadCatalogues(): Record<string, NotificationMessageCatalogue> {
  const dir = findMessageDir();
  if (!dir) return {};

  const catalogues: Record<string, NotificationMessageCatalogue> = {};
  for (const file of readdirSync(dir)) {
    const match = CATALOGUE_FILE_RE.exec(file);
    if (!match?.[1]) continue;

    catalogues[match[1]] = JSON.parse(
      readFileSync(join(dir, file), 'utf8'),
    ) as NotificationMessageCatalogue;
  }

  return catalogues;
}

const CATALOGUES = loadCatalogues();

function lookupDottedKey(
  catalogue: NotificationMessageCatalogue,
  dottedKey: string,
): string | null {
  const segments = dottedKey.split('.');
  let node: unknown = catalogue;

  for (const segment of segments) {
    if (node === null || typeof node !== 'object') {
      return null;
    }
    node = (node as Record<string, unknown>)[segment];
  }

  return typeof node === 'string' ? node : null;
}

export function resolveNotificationTemplateSource(template: string, locale: string): string {
  if (!template.startsWith('t:')) {
    return template;
  }

  const catalogue = CATALOGUES[locale];
  if (!catalogue) {
    throw new Error(`MISSING_NOTIFICATION_LOCALE: no catalogue for locale "${locale}"`);
  }

  const key = template.slice(2);
  const resolved = lookupDottedKey(catalogue, key);
  if (resolved === null) {
    throw new Error(`MISSING_NOTIFICATION_MESSAGE: key "${key}" not found for locale "${locale}"`);
  }

  return resolved;
}

export function listNotificationCatalogueLocales(): string[] {
  return Object.keys(CATALOGUES).sort();
}
