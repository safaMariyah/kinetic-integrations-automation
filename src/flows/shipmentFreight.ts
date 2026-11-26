import type { BaseClient } from '../api/baseClient';
import type { ScenarioInput, Progress, Step, PreparedShipment, FreightedShipment } from './shipmentTypes';
import type { Dataset } from '../support/datasets';
import { one, identity, positive, returned } from '../support/datasets';
import { json } from '../api/response';
import { ShipmentApi } from '../api/customerShipmentApi';
import { FreightApi, readFreightResult, sanitizedFreightResponse } from '../api/freightApi';

export type ShipmentFreightInput = Pick<ScenarioInput, 'blindShipping' | 'company' | 'freightTimeout' | 'freightUrl' | 'packageCode' | 'quantity' | 'shipVia' | 'tariff' | 'unitPrice' | 'weight' | 'workstation'>;

/** Close, freight once and verify persisted write-back; rejection never retries Freight. */
export async function freightCustomerShipment(client: BaseClient, input: ShipmentFreightInput, run: Step, progress: Progress, prepared: PreparedShipment): Promise<FreightedShipment> {
  if (prepared.company !== input.company || prepared.quantity !== input.quantity) throw new Error('Freight input differs from the prepared shipment scope or quantity. No freight operation started.');
  const packNum = positive(prepared.packNum, 'prepared pack');
  progress.packNum = packNum;
  progress.partNum = prepared.partNum;
  const ship = new ShipmentApi(client);
  let shipment = returned(await json(ship.getById(packNum), 'Read shipment before close/freight'));
  identity(one(shipment, 'ShipHead'), {Company: prepared.company, PackNum: packNum, ShipStatus: 'OPEN'});
  identity(one(shipment, 'ShipDtl'), {OrderNum: prepared.orderNum, OrderLine: prepared.orderLine, OrderRelNum: prepared.orderRelease, PartNum: prepared.partNum, OurInventoryShipQty: prepared.quantity});
  const freight = new FreightApi(client);
  await run('Close and independently verify CLOSED status', async () => {
    const header = one(shipment, 'ShipHead');
    if (typeof header.SysRowID !== 'string' || !header.SysRowID) throw new Error('Missing saved header identity.');
    await json(ship.closeShipment(header.SysRowID), 'Close shipment');
    shipment = returned(await json(ship.getById(packNum), 'Verify closed shipment'));
    identity(one(shipment, 'ShipHead'), {ShipStatus: 'CLOSED'});
  });
  let freightRequest: Dataset = {};
  await run('Build, freight and persist this shipment once', async () => {
    await json(ship.convertToManifestUOM(packNum), 'Convert manifest UOM');
    await json(freight.getFreightTimeout(), 'Read freight timeout');
    freightRequest = returned(await json(freight.buildCustomerFreightRequest(packNum), 'Build freight request'));
    const pack = one(freightRequest, 'PackInfo');
    identity(pack, {Company: input.company, PackID: packNum, FreightCarrier: input.shipVia,
      Weight: input.weight, WeightUOM: 'LB', PkgCode: input.packageCode});
    // Only the independently controlled customer=false branch is implemented; no shared-customer mutation.
    const savedCustomer=returned(await json(client.get('/Erp.BO.CustomerSvc/GetByID?custNum='+positive(one(shipment,'ShipHead').CustNum,'saved customer')), 'Verify saved customer blind-shipping prerequisite'));
    identity(one(savedCustomer,'Customer'),{Company:input.company,CustNum:one(shipment,'ShipHead').CustNum,UseBlindShipping:false});
    // Observed false-customer variants: request field reflects this shipment override.
    identity(pack, {SoldToUseBlindShipping: input.blindShipping});
    identity(one(freightRequest, 'OrderLine'), {PartNum: prepared.partNum, QtyShip: input.quantity,
      QTYShipUOM: 'EA', UnitPrice: input.unitPrice, SchedBcode: input.tariff});
    const result = await json(freight.freightCarton(freightRequest, input.freightUrl, input.workstation, input.freightTimeout), 'Freight carton');
    // Persist before validation: finally attachments and stdout retain rejected responses too.
    progress.freightResponse = sanitizedFreightResponse(result);
    console.log('Retained sanitized ERP freight response:', JSON.stringify({packNum, response: progress.freightResponse}));
    const freightDs = readFreightResult(result, packNum);
    const expectedTransaction = String(one(freightDs, 'FreightCartonResponse').TransactionNumber);
    const expectedTracking = one(freightDs, 'FreightCartonResponseTracking').TrackingNumber;
    progress.freightTransaction = expectedTransaction;
    await json(freight.updateFreightedShipment(packNum, freightDs), 'Persist freight result');
    shipment = returned(await json(ship.getById(packNum), 'Verify freighted shipment'));
    const header = one(shipment, 'ShipHead');
    identity(header, {Company: input.company, PackNum: packNum, ShipStatus: 'FREIGHTED', UseBlindShipping: input.blindShipping,
      MFTransNum: expectedTransaction, TrackingNumber: expectedTracking}, 'Independently read freighted shipment');
    if (typeof header.TrackingNumber !== 'string' || !header.TrackingNumber.trim() || !String(header.MFTransNum ?? '').trim()) throw new Error('Missing tracking or freight transaction.');
    progress.freightTransaction = String(header.MFTransNum);
  });
  const header = one(shipment, 'ShipHead');
  return {...prepared, shipment, freightRequest, freightTransaction: String(header.MFTransNum), trackingNumber: String(header.TrackingNumber)};
}
