import {createQuickShipReader} from '../../src/support/quickShipReader';
import { CustomerPartXRefApi } from '../../src/api/customerPartXRefApi';
import { verifyCustomerPartReference } from '../../src/flows/customerProductCode';
import { json, returned } from '../../src/support/datasets';
import { requireProductCodeComplete } from '../../src/flows/customerProductCode';
import { test } from '@playwright/test';
import { readFile, access } from 'node:fs/promises';
import { createEpicorClient, readEpicorSettings } from '../../src/api/baseClient';
import { customerShipment, type Progress } from '../../src/flows/customerShipment';
import { record } from '../../src/support/datasets';
import { waitForQuickShip, waitForQuickShipResponse } from '../../src/support/quickShip';
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}
function number(name: string, fallback: number, allowZero = false): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error(`${name} must be a valid scenario number.`);
  return value;
}
// Independent tests: each provisions its own part, stock, order, queue and shipment.
{
  const blindShipping = false;
  test('Customer Shipment Entry - Verify the customer Product Code new field while freighting the shipment through REST API', async ({}, testInfo) => {
    await test.step('Completeness before source 8 mutations: cross-reference, source data and integration evidence', async()=>requireProductCodeComplete());
    test.setTimeout(600000);
    const settings = readEpicorSettings();
    const directory = required('QUICKSHIP_REQUEST_DIRECTORY');
    await access(directory);
    const extraFile = process.env.POC_PART_EXTRAS_FILE?.trim();
    const partExtras = extraFile ? record(JSON.parse(await readFile(extraFile, 'utf8'))) : {};
    const input = {
      company: settings.company, customerId: required('POC_CUSTOMER_ID'),
      employeeId: required('POC_EMPLOYEE_ID'), plant: required('POC_PLANT'),
      fromWhse: required('POC_FROM_WHSE'), fromBin: required('POC_FROM_BIN'),
      toWhse: required('POC_TO_WHSE'), toBin: required('POC_TO_BIN'),
      stockQty: 200, quantity: 100,
      shipVia: required('POC_SHIP_VIA_CODE'), packageCode: required('POC_PACKAGE_CODE'),
      weight: 3, unitPrice: 1,
      tariff: '2222.22', blindShipping, customerPartCode: process.env.POC_CUSTOMER_PART_CODE?.trim() || 'EP1Testing',
      customerPartRevision: "", internalPartRevision: "", createOwnedMapping:true,
      freightUrl: required('EPICOR_FREIGHT_URL'), workstation: required('EPICOR_WORKSTATION_ID'),
      freightTimeout: number('EPICOR_FREIGHT_TIMEOUT', 60), partExtras,
    };
    if (input.stockQty < input.quantity) throw new Error('Stock must cover shipment quantity.');
    // Source EP1/cross-reference ownership is unresolved; completeness above blocks generated identity substitution.
    // Allocation template is the captured EPIC06 CHI/Zone00/Pickers setup, not a generic template.
    if (input.fromWhse !== 'CHI' || input.plant !== 'MfgSys') throw new Error('Allocation template needs validation for this context.');
    if (settings.timeoutMs <= input.freightTimeout * 1000) throw new Error('API_REQUEST_TIMEOUT_MS must exceed freight service timeout.');
    const progress: Progress = {stage: 'preflight complete'};
    const session = await createEpicorClient();
    const startedAt = Date.now();
    try {
      const result = await customerShipment(session.client, input,
        (name, action) => test.step(name, action), progress);
      await test.step('Verify this run’s actual outgoing QuickShip request', async () => {
        await waitForQuickShip(directory, {
          packNum: result.progress.packNum!, orderNum: result.progress.orderNum!,
          orderLine: result.progress.orderLine!, partNum: result.progress.partNum!,
          quantity: input.quantity, unitPrice: input.unitPrice, tariff: input.tariff,
          packageCode: input.packageCode, weight: input.weight, blindShipping,
          customerProductCode: input.customerPartCode,
        }, startedAt);
        await waitForQuickShipResponse(directory, result.progress.freightTransaction!,
          result.progress.packNum!, String(result.shipment.ShipHead &&
            (result.shipment.ShipHead as Record<string, unknown>[])[0].TrackingNumber), startedAt);
        progress.stage = 'completed: actual QuickShip request and response verified';
      });
      await test.step('Source 25: independently verify exact QuickShip pack/order/tracking/company',async()=>{
        const reader=await createQuickShipReader(required('QUICKSHIP_BASE_URL'),required('QUICKSHIP_REGISTRATION_CODE'),required('QUICKSHIP_STORAGE_STATE'));
        try{const head=(result.shipment.ShipHead as Record<string,unknown>[])[0];await reader.read({packNum:result.progress.packNum!,orderNum:result.progress.orderNum!,tracking:String(head.TrackingNumber),companyId:required('QUICKSHIP_COMPANY_ID')});}finally{await reader.dispose();}
      });
    } finally {
      try {
        // Whitelisted run identities only; no auth, raw datasets, addresses or integration JSON.
        await testInfo.attach('retained-run-identities', {body: JSON.stringify(progress, null, 2), contentType: 'application/json'});
      } finally { await session.dispose(); }
    }
  });
}
