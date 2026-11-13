import type { APIRequestContext } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import { request as playwrightRequest } from '@playwright/test';

export interface EpicorSettings {
  baseUrl: string;
  company: string;
  timeoutMs: number;
}

export function readEpicorSettings(): EpicorSettings {
  const baseUrl = process.env.EPICOR_BASE_URL?.trim();
  const company = process.env.EPICOR_COMPANY?.trim();
  const timeoutMs = Number(
    process.env.API_REQUEST_TIMEOUT_MS ?? '15000',
  );

  if (!baseUrl || !company) {
    throw new Error(
      'Set EPICOR_BASE_URL and EPICOR_COMPANY before using Epicor APIs.',
    );
  }

  const parsedUrl = new URL(baseUrl);

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      'EPICOR_BASE_URL must be an HTTPS URL without credentials, query, or fragment.',
    );
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('API_REQUEST_TIMEOUT_MS must be a positive number.');
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    company,
    timeoutMs,
  };
}

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
    });

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
    });

    return {
      response,
      elapsedMs: performance.now() - startedAt,
    };
  }
}
function requiredSecret(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Set ${name} in your local .env file.`);
  }

  return value;
}

export async function createEpicorClient() {
  const settings = readEpicorSettings();

  const username = requiredSecret('EPICOR_USERNAME');
  const password = requiredSecret('EPICOR_PASSWORD');
  const apiKey = requiredSecret('EPICOR_API_KEY');

  const context = await playwrightRequest.newContext({
    httpCredentials: {
      username,
      password,
      origin: new URL(settings.baseUrl).origin,
      send: 'always',
    },
    extraHTTPHeaders: {
      Accept: 'application/json',
      'X-API-Key': apiKey,
    },
    ignoreHTTPSErrors: false,
    failOnStatusCode: false,
    timeout: settings.timeoutMs,
  });

  return {
    client: new BaseClient(context, settings),
    dispose: async () => {
      await context.dispose();
    },
  };
}