import type { APIRequestContext } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import type { EpicorSettings } from '../config/epicor';
import { EpicorTransportError } from './response';
// Compatibility exports keep existing adapters and diagnostic tools working during migration.
export { readEpicorSettings, type EpicorSettings } from '../config/epicor';
export { createEpicorClient, type EpicorClientSession } from './epicorSession';

export class BaseClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly settings: EpicorSettings,
  ) {}

  async get(servicePath: string) {
    if (!servicePath.startsWith('/') || servicePath.startsWith('//')) {
      throw new Error('Service paths must begin with one slash.');
    }

    const url =
      `${this.settings.baseUrl}/` +
      `${encodeURIComponent(this.settings.company)}` +
      servicePath;

    const startedAt = performance.now();

    const response = await this.request.get(url, {
      timeout: this.settings.timeoutMs,
      maxRetries: 0,
      maxRedirects: 0,
      failOnStatusCode: false,
    }).catch(error => { throw new EpicorTransportError('GET', error); });

    return {
      response,
      elapsedMs: performance.now() - startedAt,
    };
  }
    async post(
    servicePath: string,
    body: Record<string, unknown>,
  ) {
    if (!servicePath.startsWith('/') || servicePath.startsWith('//')) {
      throw new Error('Service paths must begin with one slash.');
    }

    const url =
      `${this.settings.baseUrl}/` +
      `${encodeURIComponent(this.settings.company)}` +
      servicePath;

    const startedAt = performance.now();

    const response = await this.request.post(url, {
      data: body,
      timeout: this.settings.timeoutMs,
      maxRetries: 0,
      maxRedirects: 0,
      failOnStatusCode: false,
    }).catch(error => { throw new EpicorTransportError('POST', error); });

    return {
      response,
      elapsedMs: performance.now() - startedAt,
    };
  }
}
