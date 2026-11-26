import { request as playwrightRequest } from '@playwright/test';
import { BaseClient } from './baseClient';
import { readEpicorSettings, type EpicorSettings } from '../config/epicor';

/** Owns credentials and context lifetime; business adapters only receive BaseClient. */
function requiredSecret(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Set ${name} in your local .env file.`);
  }

  return value;
}

export async function createEpicorClient(settings: EpicorSettings = readEpicorSettings()) {

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

export type EpicorClientSession = Awaited<ReturnType<typeof createEpicorClient>>;
