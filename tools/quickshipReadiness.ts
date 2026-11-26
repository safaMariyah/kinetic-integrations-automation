import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readQuickShipSettings, requireQuickShipTarget } from '../src/config/quickship';
import { readEpicorSettings } from '../src/config/epicor';
import { createQuickShipReader } from '../src/integrations/quickship/reader';

/** Authentication/scope GET only. Never opens shipments, refreshes tokens or writes ERP data. */
export async function run(): Promise<void> {
  const settings = readQuickShipSettings();
  const epicor = readEpicorSettings();
  try { requireQuickShipTarget(process.argv, settings, epicor.company); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; return; }
  const directory = join('captures', 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
  await mkdir(directory, {recursive: true});
  let reader: Awaited<ReturnType<typeof createQuickShipReader>> | undefined;
  let outcome = 'FAIL';
  try {
    reader = await createQuickShipReader(settings.baseURL, settings.registrationCode, settings.storageState);
    await reader.verifyScope(settings.companyId, epicor.company);
    outcome = 'PASS';
    console.log('PASS fresh QuickShip reader verified configured company scope; registration header configured.');
  } catch {
    process.exitCode = 1;
    console.error('FAIL QuickShip session/scope readiness. Check saved-session validity, connectivity and configured scope. No shipment actions or session refresh were attempted.');
  } finally {
    try { await reader?.dispose(); }
    finally {
      await writeFile(join(directory, 'quickship-readiness.json'), JSON.stringify({
        at: new Date().toISOString(), outcome, kind: 'fresh-reader-company-scope',
        registrationHeaderConfigured: true, businessMutations: 0, shipmentVerification: 'UNVERIFIED',
      }, null, 2));
      console.log(`Readiness evidence: ${directory}`);
    }
  }
}
