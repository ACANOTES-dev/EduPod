import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MeilisearchClient implements OnModuleInit, OnModuleDestroy {
  private client: unknown = null;
  private _available = false;
  private recheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly logger = new Logger(MeilisearchClient.name);

  constructor(private readonly configService: ConfigService) {}

  get available(): boolean {
    return this._available;
  }

  async onModuleInit() {
    const url = this.configService.get<string>('MEILISEARCH_URL');
    const apiKey = this.configService.get<string>('MEILISEARCH_API_KEY');

    if (!url) {
      this.logger.warn('MEILISEARCH_URL not set — search will use PostgreSQL fallback');
      return;
    }

    try {
      // Dynamic import using a variable so TypeScript does not attempt static resolution.
      // If the meilisearch package is not installed, the import will throw and we degrade.
      const meiliPackage = 'meilisearch';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { MeiliSearch } = await (Function(
        'pkg',
        'return import(pkg)',
      )(meiliPackage) as Promise<{
        MeiliSearch: new (opts: { host: string; apiKey?: string }) => unknown;
      }>);
      this.client = new MeiliSearch({ host: url, apiKey });
      await (this.client as { health(): Promise<unknown> }).health();
      this._available = true;
      this.logger.log('Meilisearch connected');
    } catch (error) {
      this.logger.warn(
        `Meilisearch unavailable — using PostgreSQL fallback: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!this._available && this.client) {
      this.startRecheckTimer();
    }
  }

  onModuleDestroy(): void {
    if (this.recheckTimer) {
      clearInterval(this.recheckTimer);
      this.recheckTimer = null;
    }
  }

  private startRecheckTimer(): void {
    if (this.recheckTimer) return;
    this.recheckTimer = setInterval(async () => {
      try {
        await (this.client as { health(): Promise<unknown> }).health();
        this._available = true;
        this.logger.log('Meilisearch recovered — search is available');
        if (this.recheckTimer) {
          clearInterval(this.recheckTimer);
          this.recheckTimer = null;
        }
      } catch {
        this.logger.debug('Meilisearch still unavailable — will retry in 60s');
      }
    }, 60_000);
  }

  async search(
    indexName: string,
    query: string,
    options: Record<string, unknown> = {},
  ): Promise<{ hits: Record<string, unknown>[] } | null> {
    if (!this._available || !this.client) return null;

    try {
      const meiliClient = this.client as {
        index(name: string): {
          search(q: string, opts: unknown): Promise<{ hits: Record<string, unknown>[] }>;
        };
      };
      return await meiliClient.index(indexName).search(query, options);
    } catch (error) {
      this.logger.error(
        `Search failed for index "${indexName}" query "${query}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async addDocuments(indexName: string, documents: Record<string, unknown>[]): Promise<void> {
    if (!this._available || !this.client) return;

    try {
      const meiliClient = this.client as {
        index(name: string): { addDocuments(docs: unknown[]): Promise<unknown> };
      };
      await meiliClient.index(indexName).addDocuments(documents);
    } catch (error) {
      this.logger.error(`Failed to index documents: ${String(error)}`);
    }
  }

  async deleteDocument(indexName: string, documentId: string): Promise<void> {
    if (!this._available || !this.client) return;

    try {
      const meiliClient = this.client as {
        index(name: string): { deleteDocument(id: string): Promise<unknown> };
      };
      await meiliClient.index(indexName).deleteDocument(documentId);
    } catch (error) {
      this.logger.error(`Failed to delete document: ${String(error)}`);
    }
  }
}
