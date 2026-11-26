import { randomBytes } from 'node:crypto';
import { readArtifactDirectory } from '../../src/config/artifacts';
import { required, scenarioNumber as number } from '../../src/config/values';
import {decodeArtifact} from '../../src/integrations/quickship/artifacts';

import { CustomerPartXRefApi } from '../../src/api/customerPartXRefApi';
import { verifyCustomerPartReference } from '../../src/flows/customerProductCode';
import { json, returned } from '../../src/support/datasets';
import { requireProductCodeComplete } from '../../src/flows/customerProductCode';
import { test, readPartExtras } from '../fixtures';
import { readFile } from 'node:fs/promises';
import { readEpicorSettings } from '../../src/api/baseClient';
import { customerShipment, type Progress } from '../../src/flows/customerShipment';
import { waitForQuickShip, waitForQuickShipResponse } from '../../src/integrations/quickship/artifacts';
// Independent tests: each provisions its own part, stock, order, queue and shipment.
{
  const blindShipping = false;
  test('Customer Shipment Entry - Verify the customer Product Code new field while freighting the shipment through REST API', async ({epicor, quickShip: reader}, testInfo) => {
    test.setTimeout(600000);
    const settings = readEpicorSettings();
    const directory = await readArtifactDirectory();
    requireProductCodeComplete(true);
    const partExtras = await readPartExtras();
    // Approved substitution: ten-character per-run customer code, matching source code length.
    const input = {
      company: settings.company, customerId: required('POC_CUSTOMER_ID'),
      employeeId: required('POC_EMPLOYEE_ID'), plant: required('POC_PLANT'),
      fromWhse: required('POC_FROM_WHSE'), fromBin: required('POC_FROM_BIN'),
      toWhse: required('POC_TO_WHSE'), toBin: required('POC_TO_BIN'),
      stockQty: 200, quantity: 100,
      shipVia: required('POC_SHIP_VIA_CODE'), packageCode: required('POC_PACKAGE_CODE'),
      weight: 3, unitPrice: 1,
      tariff: '2222.22', blindShipping, customerPartCode: randomBytes(5).toString('hex').toUpperCase(),
      customerPartRevision: "", internalPartRevision: "", createOwnedMapping:true,
      freightUrl: required('EPICOR_FREIGHT_URL'), workstation: required('EPICOR_WORKSTATION_ID'),
      freightTimeout: number('EPICOR_FREIGHT_TIMEOUT', 60), partExtras,
    };
    if (input.stockQty < input.quantity) throw new Error('Stock must cover shipment quantity.');
    // Unique part and owned mapping substitute illustrative EP1 by explicit approval.
    // Allocation template is the captured EPIC06 CHI/Zone00/Pickers setup, not a generic template.
    if (input.fromWhse !== 'CHI' || input.plant !== 'MfgSys') throw new Error('Allocation template needs validation for this context.');
    if (settings.timeoutMs <= input.freightTimeout * 1000) throw new Error('API_REQUEST_TIMEOUT_MS must exceed freight service timeout.');
    const quickShipCompany=required('QUICKSHIP_COMPANY_ID');
    const progress: Progress = {stage: 'preflight complete'};
    const startedAt = Date.now();
    try {
      const result = await customerShipment(epicor, input,
        (name, action) => test.step(name, action), progress);
      let outgoingRequest: unknown;
      let carrierResponse: unknown;
      await test.step('Verify this run’s actual outgoing QuickShip request', async () => {
        const requestPath = await waitForQuickShip(directory, {
          packNum: result.progress.packNum!, orderNum: result.progress.orderNum!,
          orderLine: result.progress.orderLine!, partNum: result.progress.partNum!,
          quantity: input.quantity, unitPrice: input.unitPrice, tariff: input.tariff,
          packageCode: input.packageCode, weight: input.weight, blindShipping,
          customerProductCode: input.customerPartCode,
        }, startedAt);
        outgoingRequest = decodeArtifact(await readFile(requestPath, 'utf8'));
        const responsePath = await waitForQuickShipResponse(directory, result.progress.freightTransaction!,
          result.progress.packNum!, String(result.shipment.ShipHead &&
            (result.shipment.ShipHead as Record<string, unknown>[])[0].TrackingNumber), startedAt);
        carrierResponse = decodeArtifact(await readFile(responsePath, 'utf8'));
        progress.stage = 'completed: actual QuickShip request and response verified';
      });
      await test.step('Source 25: independently verify exact QuickShip pack/order/tracking/company',async()=>{
        {const head=(result.shipment.ShipHead as Record<string,unknown>[])[0];await reader.read({packNum:result.progress.packNum!,quickShipShipmentNumber:Number(result.progress.freightTransaction),orderNum:result.progress.orderNum!,tracking:String(head.TrackingNumber),companyId:quickShipCompany,scope:{companyName:settings.company,plant:input.plant,workstation:input.workstation,erpShipment:result.shipment,outgoingRequest,carrierResponse}});}
      });
    } finally {
      // Whitelisted identities only; fixture teardown owns connection disposal.
      await testInfo.attach('retained-run-identities', {body: JSON.stringify(progress, null, 2), contentType: 'application/json'});
    }
  });
}
