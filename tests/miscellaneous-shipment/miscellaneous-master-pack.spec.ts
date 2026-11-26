import { buildPurchasedStockPart } from '../../src/flows/purchasedPart';
import { test } from '../fixtures';
import { readEpicorSettings } from '../../src/api/baseClient';
import { miscellaneousMasterPack, requireMiscMasterScope, type MiscMasterProgress } from '../../src/flows/miscellaneousMasterPack';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}

test('S5–S10: M1 miscellaneous shipment included in a master pack', async ({epicor}, testInfo) => {
  test.setTimeout(600000);
  const settings = readEpicorSettings();
  const scope = `${settings.baseUrl}|${settings.company}|unique-part|10|7|close-misc|master`;
  if (process.env.MISC_MASTER_AUTHORIZED_TARGET !== scope) throw new Error('Explicit live authorization and exact MISC_MASTER_AUTHORIZED_TARGET required before any API calls.');
  // Approved identity substitution: preserve description M1 and every substantive source value.
  const partNum = buildPurchasedStockPart(settings.company).PartNum;
  const input = {partNum, company: settings.company, plant: required('POC_PLANT'), warehouse: required('POC_FROM_WHSE'),
    shippingWarehouse: required('POC_TO_WHSE'), shippingBin: required('POC_TO_BIN'), employeeId: required('POC_EMPLOYEE_ID')};
  requireMiscMasterScope(input);
  const progress: MiscMasterProgress = {stage: 'authorized scope validated'};
  try {
    await miscellaneousMasterPack(epicor, input, (name, action) => test.step(name, action), progress);
  } finally {
    await testInfo.attach('retained-identities-and-checkpoint', {body: JSON.stringify(progress, null, 2), contentType: 'application/json'});
  }
});
