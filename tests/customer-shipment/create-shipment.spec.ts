import { test, readPartExtras } from '../fixtures';
import { readFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { required, scenarioNumber } from '../../src/config/values';
import { readArtifactDirectory } from '../../src/config/artifacts';
import { readQuickShipSettings } from '../../src/config/quickship';
import { prepareOrderForShipping } from '../../src/flows/orderPreparation';
import { createOpenCustomerShipment } from '../../src/flows/shipmentPreparation';
import { setCreateShipmentOption, createShipmentVariants, shipmentVariantPlan, FreightTransitionLedger,
  sendCreateShipmentStage, persistCreatedShipment, persistFreightedShipment } from '../../src/flows/createShipment';
import { ShipmentApi } from '../../src/api/customerShipmentApi';
import { FreightApi } from '../../src/api/freightApi';
import { one, identity, returned, type Row } from '../../src/support/datasets';
import { json } from '../../src/api/response';
import { checkpointSteps } from '../../src/support/workflow';
import type { Progress, ScenarioInput } from '../../src/flows/shipmentTypes';
import { decodeArtifact, waitForQuickShip, waitForQuickShipResponse, waitForCreateOnlyResponse, stageArtifactProjection } from '../../src/integrations/quickship/artifacts';

for (const variant of createShipmentVariants) {
  test(`Sources 24?32: Create Shipment ${variant}`, async ({epicor, epicorSettings, quickShip}, testInfo) => {
    test.setTimeout(600000);
    const directory = await readArtifactDirectory(), qs = readQuickShipSettings();
    const plan = shipmentVariantPlan(variant);
    const input: ScenarioInput = {company:epicorSettings.company, customerId:required('POC_CUSTOMER_ID'),
      employeeId:required('POC_EMPLOYEE_ID'), plant:required('POC_PLANT'), fromWhse:required('POC_FROM_WHSE'),
      fromBin:required('POC_FROM_BIN'), toWhse:required('POC_TO_WHSE'), toBin:required('POC_TO_BIN'),
      ...plan.sourceInputs, shipVia:required('POC_SHIP_VIA_CODE'), packageCode:required('POC_PACKAGE_CODE'),
      weight:3, blindShipping:false, freightUrl:required('EPICOR_FREIGHT_URL'), workstation:required('EPICOR_WORKSTATION_ID'),
      freightTimeout:scenarioNumber('EPICOR_FREIGHT_TIMEOUT',60), partExtras:await readPartExtras()};
    if (input.plant !== 'MfgSys' || input.fromWhse !== 'CHI' || input.shipVia !== 'F92' || input.packageCode !== 'BOX' || epicorSettings.timeoutMs <= input.freightTimeout*1000) throw new Error('Create Shipment requires the evidenced allocation/carrier profile and a sufficient API timeout.');
    const progress: Progress = {stage:'preflight complete'};
    let ledger: FreightTransitionLedger | undefined;
    const run = checkpointSteps((name, action) => test.step(name, action), progress);
    try {
      const picked = await prepareOrderForShipping(epicor, input, run, progress);
      let prepared = await createOpenCustomerShipment(epicor, input, picked, run, progress);
      const ship = new ShipmentApi(epicor), freight = new FreightApi(epicor);
      const checked = variant === 'checked-then-freight';
      prepared = {...prepared, shipment:await run(`Source ${checked ? '24' : '25'}: save and independently verify checkbox`, () => setCreateShipmentOption(epicor,input.company,prepared.packNum,checked))};
      identity(one(prepared.shipment,'ShipDtl'), {PartNum:prepared.partNum, OrderNum:prepared.orderNum, OurInventoryShipQty:input.quantity});
      await run('Source 26: close exact pack and verify CLOSED', async () => {
        await json(ship.closeShipment(String(one(prepared.shipment,'ShipHead').SysRowID)), 'Close prepared create-shipment pack');
        const saved = returned(await json(ship.getById(prepared.packNum),'Read CLOSED pack'));
        identity(one(saved,'ShipHead'), {Company:input.company,PackNum:prepared.packNum,ShipStatus:'CLOSED',CreateShipment:checked});
      });
      ledger = new FreightTransitionLedger(variant,prepared.packNum);
      for (const stage of plan.stages) {
        const startedAt = Date.now();
        await run(`Sources 27?32: ${stage} and independent integration verification`, async () => {
          const body = await sendCreateShipmentStage(epicor,input,prepared,ledger!,stage,progress);
          const transaction = progress.freightTransaction!;
          const shipment = stage === 'create-only'
            ? await persistCreatedShipment(freight,ship,input.company,prepared.packNum)
            : await persistFreightedShipment(freight,ship,input.company,prepared.packNum,body);
          const head = one(shipment,'ShipHead');
          if (stage === 'create-only') identity(head,{CreateShipment:false,IsShipmentCreated:true,TrackingNumber:''});
          const requestPath = await waitForQuickShip(directory,{packNum:prepared.packNum,orderNum:prepared.orderNum,
            orderLine:prepared.orderLine,partNum:prepared.partNum,quantity:input.quantity,unitPrice:input.unitPrice,tariff:input.tariff,
            packageCode:input.packageCode,weight:input.weight,blindShipping:false,createShipment:stage === 'create-only'},startedAt);
          const responsePath = stage === 'create-only' ? await waitForCreateOnlyResponse(directory,transaction,startedAt)
            : await waitForQuickShipResponse(directory,transaction,prepared.packNum,String(head.TrackingNumber),startedAt);
          // Same transaction files can be overwritten by the next stage; retain each before proceeding.
          for (const [kind,path] of [['request',requestPath],['response',responsePath]] as const) {
            const content = await readFile(path,'utf8');
            const destination = testInfo.outputPath(`${stage}-${kind}.json`);
            const privateCopy = join('.runtime','stage-artifacts',String(testInfo.config.metadata.runId),
              createHash('sha256').update(testInfo.testId).digest('hex'),`${stage}-${kind}.json`);
            await mkdir(dirname(privateCopy),{recursive:true}); await copyFile(path,privateCopy);
            await mkdir(dirname(destination),{recursive:true});
            await writeFile(destination,JSON.stringify({sha256:createHash('sha256').update(content).digest('hex'),
              stage,kind,projection:stageArtifactProjection(decodeArtifact(content),kind)},null,2));
          }
          const scope = {companyName:input.company,plant:input.plant,workstation:input.workstation,erpShipment:shipment,
            outgoingRequest:decodeArtifact(await readFile(requestPath,'utf8')),carrierResponse:decodeArtifact(await readFile(responsePath,'utf8'))};
          const expected = {packNum:prepared.packNum,quickShipShipmentNumber:Number(transaction),orderNum:prepared.orderNum,
            tracking:String(head.TrackingNumber),companyId:qs.companyId,scope};
          if (stage === 'create-only') await quickShip.readCreated(expected); else await quickShip.read(expected);
          ledger!.verified(stage);
        });
      }
    } finally {
      await testInfo.attach('retained-run-identities-and-transitions',{body:JSON.stringify({progress,transitions:ledger?.snapshot()},null,2),contentType:'application/json'});
    }
  });
}
