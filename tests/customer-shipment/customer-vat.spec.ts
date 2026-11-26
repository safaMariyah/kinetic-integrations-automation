import { readArtifactDirectory } from '../../src/config/artifacts';
import { required, scenarioNumber as number } from '../../src/config/values';

import { CustomerApi } from '../../src/api/customerApi';
import { saveCustomerVat, requireCustomerVatComplete, verifyCustomerVat, selectedVatRows, readCustomerVat, verifyVatIntegrationSetup } from '../../src/flows/customerVat';
import { decodeArtifact } from '../../src/integrations/quickship/artifacts';

import { identity, one } from '../../src/support/datasets';

import { test, readPartExtras } from '../fixtures';
import { readFile } from 'node:fs/promises';
import { readEpicorSettings } from '../../src/api/baseClient';
import { customerShipment, type Progress } from '../../src/flows/customerShipment';
import { waitForQuickShip, waitForQuickShipResponse } from '../../src/integrations/quickship/artifacts';
// Independent tests: each provisions its own part, stock, order, queue and shipment.
{
  test.describe.configure({mode: 'serial', retries: 0});
  const blindShipping = false;
  test('Sources 1-27: customer billing and selected ship-to VAT through REST freight', async ({epicor, quickShip: reader}, testInfo) => {
    const vatInput = {company: readEpicorSettings().company, customerId: 'ECD', shipToCode: 'EDA-A', billingVat: 'BillingVAT', shipToVat: 'SHIPTOVAT'};
    requireCustomerVatComplete(vatInput);
    test.setTimeout(600000);
    const settings = readEpicorSettings();
    const directory = await readArtifactDirectory();
    const partExtras = await readPartExtras();
    const input = {
      company: settings.company, customerId: vatInput.customerId, shipToCode: vatInput.shipToCode,
      shipDate: new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date()) + 'T00:00:00',
      employeeId: required('POC_EMPLOYEE_ID'), plant: required('POC_PLANT'),
      fromWhse: required('POC_FROM_WHSE'), fromBin: required('POC_FROM_BIN'),
      toWhse: required('POC_TO_WHSE'), toBin: required('POC_TO_BIN'),
      stockQty: 200, quantity: 100,
      shipVia: required('POC_SHIP_VIA_CODE'), packageCode: required('POC_PACKAGE_CODE'),
      weight: 3, unitPrice: 1,
      tariff: '2222.22', blindShipping,
      freightUrl: required('EPICOR_FREIGHT_URL'), workstation: required('EPICOR_WORKSTATION_ID'),
      freightTimeout: number('EPICOR_FREIGHT_TIMEOUT', 60), partExtras,
    };
    if (input.shipVia !== 'F92' || input.packageCode !== 'BOX' || input.fromBin !== '00-00-00' || input.toWhse !== 'SHP' || input.toBin !== 'SHP-1') throw new Error('VAT scenario requires evidenced FedEx Ground F92, BOX and source/shipping locations.');
    if (input.stockQty < input.quantity) throw new Error('Stock must cover shipment quantity.');
    // A unique simple stock part substitutes illustrative EP1; no customer part mapping is created.
    // Allocation template is the captured EPIC06 CHI/Zone00/Pickers setup, not a generic template.
    if (input.fromWhse !== 'CHI' || input.plant !== 'MfgSys') throw new Error('Allocation template needs validation for this context.');
    if (settings.timeoutMs <= input.freightTimeout * 1000) throw new Error('API_REQUEST_TIMEOUT_MS must exceed freight service timeout.');
    const quickShipCompany=required('QUICKSHIP_COMPANY_ID');
    const progress: Progress = {stage: 'preflight complete'};
    const startedAt = Date.now();
    try {
      const api = new CustomerApi(epicor);
      await test.step('Sources 4/6/7/11: read-only completeness preflight before all business mutations', async () => {
        await verifyVatIntegrationSetup(epicor, input.workstation);
        const before = selectedVatRows(await readCustomerVat(api, vatInput), vatInput);
        await testInfo.attach('vat-run-intent-and-before-image', {body: JSON.stringify({company: vatInput.company, customerId: vatInput.customerId, customerNum: before.custNum, shipToCode: vatInput.shipToCode, billingVatBefore: before.customer.CustomerVATNum, shipToVatBefore: before.shipTo.ShipToVAT, intendedBillingVat: vatInput.billingVat, intendedShipToVat: vatInput.shipToVat, retryPolicy: 'no automatic mutation retries', retainedEffects: 'VAT master changes, stock, order, pack, freight and carrier effects; no cleanup'}), contentType: 'application/json'});
      });
      const persistedVat = await test.step('Source 11: save billing and selected ship-to VAT and independently read both', () => saveCustomerVat(api, vatInput, stage => {progress.stage = stage;}));
      const sourceLabels: Record<string, string> = {
        'Create and verify unique purchased stock part': 'Sources 8-9', 'Add stock and verify persisted source balance': 'Source 10',
        'Create order, line and release using this run?s part and quantity': 'Sources 12-13',
        'Allocate and release this order for picking': 'Sources 14-19', 'Discover, select and move the new queue to shipping': 'Sources 20-21',
        'Create shipment header and save its new pack number': 'Source 22', 'Create and verify shipment line with the picked quantity': 'Source 23',
        'Close and independently verify CLOSED status': 'Source 24', 'Build, freight and persist this shipment once': 'Source 25',
      };
      const result = await customerShipment(epicor, input,
        (name, action) => test.step(`${sourceLabels[name] ?? 'Sources 12-13'}: ${name}`, async () => {
          if (name === 'Build, freight and persist this shipment once') {
            const current = selectedVatRows(await readCustomerVat(api, vatInput), vatInput);
            identity(current.customer, {CustomerVATNum: persistedVat.billingVat});
            identity(current.shipTo, {ShipToVAT: persistedVat.shipToVat});
          }
          return action();
        }), progress);
      let outgoingRequest: unknown;
      let carrierResponse: unknown;
      await test.step('Verify this run’s actual outgoing QuickShip request', async () => {
        const requestPath = await waitForQuickShip(directory, {
          packNum: result.progress.packNum!, orderNum: result.progress.orderNum!,
          orderLine: result.progress.orderLine!, partNum: result.progress.partNum!,
          quantity: input.quantity, unitPrice: input.unitPrice, tariff: input.tariff,
          packageCode: input.packageCode, weight: input.weight, blindShipping,

        }, startedAt);
        verifyCustomerVat(decodeArtifact(await readFile(requestPath, 'utf8')), {...persistedVat, packNum: result.progress.packNum!, orderNum: result.progress.orderNum!});
        outgoingRequest = decodeArtifact(await readFile(requestPath, 'utf8'));
        const responsePath = await waitForQuickShipResponse(directory, result.progress.freightTransaction!,
          result.progress.packNum!, String(one(result.shipment, 'ShipHead').TrackingNumber), startedAt);
        carrierResponse = decodeArtifact(await readFile(responsePath, 'utf8'));
        progress.stage = 'completed: actual QuickShip request and response verified';
      });
      await test.step('Source 26: independently verify exact QuickShip shipment/order/tracking/company',async()=>{
        {const head=one(result.shipment, 'ShipHead');await reader.read({packNum:result.progress.packNum!,quickShipShipmentNumber:Number(result.progress.freightTransaction),orderNum:result.progress.orderNum!,tracking:String(head.TrackingNumber),companyId:quickShipCompany,scope:{companyName:settings.company,plant:input.plant,workstation:input.workstation,erpShipment:result.shipment,outgoingRequest,carrierResponse}});}
      });
    } finally {
      // Whitelisted identities only; fixture teardown owns connection disposal.
      await testInfo.attach('retained-run-identities', {body: JSON.stringify(progress, null, 2), contentType: 'application/json'});
    }
  });
}
