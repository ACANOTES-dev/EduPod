import { Logger } from '@nestjs/common';

const logger = new Logger('WorkerSearchHelpers');

let meilisearchClientPromise:
  | Promise<{
      index(name: string): { deleteDocument(id: string): Promise<unknown> };
    } | null>
  | null = null;

async function loadMeilisearchClient(): Promise<{
  index(name: string): { deleteDocument(id: string): Promise<unknown> };
} | null> {
  const url = process.env['MEILISEARCH_URL'];
  const apiKey = process.env['MEILISEARCH_API_KEY'];

  if (!url) {
    return null;
  }

  try {
    const meiliPackage = 'meilisearch';
    const { MeiliSearch } = await (Function(
      'pkg',
      'return import(pkg)',
    )(meiliPackage) as Promise<{
      MeiliSearch: new (options: { host: string; apiKey?: string }) => {
        health(): Promise<unknown>;
        index(name: string): { deleteDocument(id: string): Promise<unknown> };
      };
    }>);
    const client = new MeiliSearch({ host: url, apiKey });
    await client.health();
    return client;
  } catch (error) {
    logger.warn(
      `Meilisearch unavailable in worker cleanup: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function deleteSearchDocument(
  indexName: string,
  documentId: string,
): Promise<void> {
  if (!meilisearchClientPromise) {
    meilisearchClientPromise = loadMeilisearchClient();
  }

  const client = await meilisearchClientPromise;
  if (!client) {
    return;
  }

  try {
    await client.index(indexName).deleteDocument(documentId);
  } catch (error) {
    logger.warn(
      `Failed to delete Meilisearch document ${indexName}/${documentId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
