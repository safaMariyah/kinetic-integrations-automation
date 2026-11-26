import { request, type APIRequestContext } from '@playwright/test';
import { rename, rm, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { QuickShipSettings } from '../../config/quickship';
import { createQuickShipReader } from './reader';

type Dependencies = {
  context: (options: Parameters<typeof request.newContext>[0]) => Promise<APIRequestContext>;
  reader: typeof createQuickShipReader;
};

/** One authentication refresh only; no shipment navigation, business writes or retries. */
export async function renewQuickShipSession(settings: QuickShipSettings, company: string,
  checkpoint: (stage: string) => void,
  dependencies: Dependencies = {context: options => request.newContext(options), reader: createQuickShipReader}) {
  const temporary = settings.storageState + '.' + randomUUID() + '.pending';
  let context: APIRequestContext | undefined;
  try {
    checkpoint('load configured saved session');
    context = await dependencies.context({baseURL: settings.baseURL, storageState: settings.storageState,
      ignoreHTTPSErrors: false, extraHTTPHeaders: {registrationcode: settings.registrationCode}});
    checkpoint('authentication refresh attempted once');
    const response = await context.post('/api/authentication/refresh', {data: null, maxRetries: 0, maxRedirects: 0});
    if (response.status() !== 200) throw new Error(`Authentication refresh HTTP ${response.status()}; existing saved state was not replaced.`);
    await context.storageState({path: temporary});
    await chmod(temporary, 0o600);
    checkpoint('verify rotated session before replacing saved state');
    const candidate = await dependencies.reader(settings.baseURL, settings.registrationCode, temporary);
    try { await candidate.verifyScope(settings.companyId, company); } finally { await candidate.dispose(); }
    await rename(temporary, settings.storageState);
    checkpoint('saved session replaced; verify exact reader path');
    const fresh = await dependencies.reader(settings.baseURL, settings.registrationCode, settings.storageState);
    try { await fresh.verifyScope(settings.companyId, company); } finally { await fresh.dispose(); }
    checkpoint('PASS fresh reader verified saved session scope');
  } finally {
    try { await context?.dispose(); }
    finally { await rm(temporary, {force: true}); }
  }
}
