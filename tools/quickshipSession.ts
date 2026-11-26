import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readQuickShipSettings, requireQuickShipTarget } from '../src/config/quickship';
import { readEpicorSettings } from '../src/config/epicor';
import { renewQuickShipSession } from '../src/integrations/quickship/session';
import { acquireLiveLock } from '../src/support/liveLock';

export async function run(): Promise<void> {
  const settings = readQuickShipSettings(), epicor = readEpicorSettings();
  try { requireQuickShipTarget(process.argv, settings, epicor.company); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; return; }
  const release = await acquireLiveLock(process.env.LIVE_LOCK_DIRECTORY?.trim() || '.runtime/locks', `${epicor.baseUrl}|${epicor.company}`);
  const directory = join('captures', 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
  let stage = 'configuration validated', outcome = 'FAIL';
  try {
    await mkdir(directory, {recursive: true});
    await renewQuickShipSession(settings, epicor.company, value => { stage = value; });
    outcome = 'PASS';
    console.log('PASS authentication renewed; fresh API reader verified the exact saved-session path and company scope.');
  } catch {
    process.exitCode = 1;
    console.error(`QuickShip session renewal failed at: ${stage}. Session values and server payloads withheld. No business actions ran.`);
  } finally {
    try { await writeFile(join(directory, 'session-renewal.json'), JSON.stringify({
      at: new Date().toISOString(), kind: 'authentication-only', outcome, stage, businessMutations: 0,
      shipmentVerification: 'UNVERIFIED', registrationHeaderConfigured: true,
    }, null, 2)); }
    finally { await release(); }
    console.log(`Authentication evidence: ${directory}`);
  }
}
