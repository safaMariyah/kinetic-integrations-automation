import { test as base, type TestInfo } from '@playwright/test';
import { readQuickShipSettings } from '../src/config/quickship';
import { readFile } from 'node:fs/promises';
import { createEpicorClient, readEpicorSettings, type BaseClient, type EpicorSettings } from '../src/api/baseClient';
import { createQuickShipReader } from '../src/integrations/quickship/reader';
import { MasterDataApi } from '../src/api/masterDataApi';
import { json } from '../src/api/response';
import { identity, one, returned } from '../src/support/datasets';
import { required } from '../src/config/values';
import { getCACertificates } from 'node:tls';
import { createHash } from 'node:crypto';

type QuickShipReader = Awaited<ReturnType<typeof createQuickShipReader>>;
type Fixtures = {
  _runEvidence: void;
  epicorSettings: EpicorSettings;
  epicor: BaseClient;
  quickShip: QuickShipReader;
  scenarioRun: { startedAt: number; checkpoint(value: unknown): void };
};

/** Shared infrastructure only: scenario mutations remain explicit in each test. */
export const test = base.extend<Fixtures>({
  // Automatic evidence starts before requested API fixtures, retaining setup-failure context.
  _runEvidence: [async ({}, use, testInfo) => {
    await testInfo.attach('run-context', {body: JSON.stringify({
      runId: testInfo.config.metadata.runId, testId: testInfo.testId,
      scenario: testInfo.title, file: testInfo.file, startedAt: new Date().toISOString(),
    }, null, 2), contentType: 'application/json'});
    await use();
  }, {auto: true}],
  epicorSettings: async ({}, use) => use(readEpicorSettings()),
  epicor: async ({epicorSettings}, use) => {
    const ca = process.env.NODE_EXTRA_CA_CERTS;
    console.log('Worker trust:', JSON.stringify({
      node: process.version,
      explicitCaConfigured: Boolean(ca),
      explicitCaSha256: ca ? createHash('sha256').update(await readFile(ca)).digest('hex') : null,
      loadedExtraCaCount: typeof getCACertificates === 'function' ? getCACertificates('extra').length : null,
      remotePlaywrightConfigured: Boolean(process.env.PW_TEST_CONNECT_WS_ENDPOINT),
    }));
    const session = await createEpicorClient(epicorSettings);
    try {
      // A read in the actual worker verifies TLS, authentication and target
      // before a scenario can send its first business mutation.
      const warehouse = required('POC_FROM_WHSE');
      identity(one(returned(await json(new MasterDataApi(session.client).warehouse(warehouse),
        'Worker readiness: read configured source warehouse before business writes')), 'Warehse'),
        {Company: epicorSettings.company, Plant: required('POC_PLANT'), WarehouseCode: warehouse},
        'Worker ERP target scope');
      await use(session.client);
    }
    finally { await session.dispose(); }
  },
  quickShip: async ({epicorSettings}, use) => {
    const settings = readQuickShipSettings();
    const reader = await createQuickShipReader(settings.baseURL, settings.registrationCode, settings.storageState);
    try {
      await reader.verifyScope(settings.companyId, epicorSettings.company);
      await use(reader);
    } finally { await reader.dispose(); }
  },
  scenarioRun: async ({}, use, testInfo: TestInfo) => {
    const startedAt = Date.now();
    let latest: unknown = {scenario: testInfo.title, source: testInfo.file, stage: 'started'};
    try { await use({startedAt, checkpoint(value) { latest = value; }}); }
    finally { await testInfo.attach('scenario-checkpoint', {body: JSON.stringify(latest, null, 2), contentType: 'application/json'}); }
  },
});

export async function readPartExtras(): Promise<Record<string, unknown>> {
  const file = process.env.POC_PART_EXTRAS_FILE?.trim();
  if (!file) return {};
  const value: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('POC_PART_EXTRAS_FILE must contain one JSON object.');
  return value as Record<string, unknown>;
}
