import { readQuickShipSettings } from '../src/config/quickship';
import { access } from 'node:fs/promises';
import { readEpicorSettings } from '../src/config/epicor';
import { required } from '../src/config/values';
import { readArtifactDirectory } from '../src/config/artifacts';

/** Configuration and filesystem checks only. This command makes no network requests. */
export async function run() {
  let failures = 0;
  async function check(name: string, action: () => unknown | Promise<unknown>) {
    try { await action(); console.log(`PASS ${name}`); }
    catch { failures++; console.error(`FAIL ${name}. Review the named settings; values are withheld.`); }
  }
  await check('ERP HTTPS URL, company and timeout configuration', () => readEpicorSettings());
  await check('ERP credentials present: EPICOR_USERNAME, EPICOR_PASSWORD, EPICOR_API_KEY', () => {
    for (const name of ['EPICOR_USERNAME', 'EPICOR_PASSWORD', 'EPICOR_API_KEY']) required(name);
  });
  await check('QuickShip origin and registration/company settings', () => readQuickShipSettings());
  await check('QuickShip saved state file accessible (session validity unverified)', () => access(readQuickShipSettings().storageState));
  await check('Confirmed outgoing artifact directory accessible', () => readArtifactDirectory());
  if (process.env.NODE_EXTRA_CA_CERTS) await check('NODE_EXTRA_CA_CERTS file accessible', () => access(required('NODE_EXTRA_CA_CERTS')));
  console.log('Authentication validity, permissions, ERP master data and live business outcomes remain UNVERIFIED.');
  if (failures) process.exitCode = 1;
}
