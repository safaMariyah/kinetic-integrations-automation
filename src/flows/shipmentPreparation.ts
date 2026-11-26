import { requirePreparationIdentity } from './scenarioPreflight';
import type { BaseClient } from '../api/baseClient';
import type { ScenarioInput, Progress, Step, PickedOrder, PreparedShipment } from './shipmentTypes';
import type { Dataset } from '../support/datasets';
import { rows, one, identity, positive, parameters, dataset, returned, changed, stringsEmpty } from '../support/datasets';
import { json } from '../api/response';
import { ShipmentApi } from '../api/customerShipmentApi';
import { prepareNewShipmentQuantity } from '../api/customerShipmentApi';
import { assertMasterSave } from '../api/shipmentSave';

export type ShipmentPreparationInput = Pick<ScenarioInput, 'blindShipping' | 'company' | 'customerId' | 'customerPartCode' | 'customerPartRevision' | 'internalPartRevision' | 'packageCode' | 'plant' | 'quantity' | 'shipDate' | 'shipToCode' | 'shipVia' | 'toBin' | 'toWhse' | 'weight'>;

/** Create an OPEN customer pack using the prepared order and picked stock. */
export async function createOpenCustomerShipment(client: BaseClient, input: ShipmentPreparationInput, picked: PickedOrder, run: Step, progress: Progress): Promise<PreparedShipment> {
  requirePreparationIdentity(picked, 'shipment');
  if (picked.company !== input.company || picked.plant !== input.plant || picked.quantity !== input.quantity ||
      picked.shippingWarehouse !== input.toWhse || picked.shippingBin !== input.toBin) {
    throw new Error('Shipment input differs from the verified picked order scope, quantity or shipping location. No shipment operation started.');
  }
  Object.assign(progress, {partNum: picked.partNum, orderNum: picked.orderNum, orderLine: picked.orderLine, orderRelease: picked.orderRelease});
  let packNum = 0;
  const ship = new ShipmentApi(client);
  let shipment: Dataset = {};
  await run('Create shipment header and save its new pack number', async () => {
    let ds = dataset(await json(ship.getNewShipHead({}), 'Initialize shipment'));
    const info = await json(ship.getHeadOrderInfo(picked.orderNum, ds), 'Set shipment order');
    stringsEmpty(parameters(info), ['creditMessage']);
    ds = dataset(info);
    identity(one(ds, 'ShipHead'), {Company: input.company, OrderNum: picked.orderNum,
      CustomerCustID: input.customerId, Plant: input.plant, CreditHold: false, OrderHold: false});
    ds = dataset(await json(ship.onChangeShipViaCode(input.shipVia, changed(ds, 'ShipHead', {ShipViaCode: input.shipVia})), 'Set shipment carrier'));
    ds = dataset(await json(ship.getPackaging(input.packageCode, ds), 'Set shipment package'));
    ds = changed(ds, 'ShipHead', {Weight: input.weight, WeightUOM: 'LB', UseBlindShipping: input.blindShipping, ...(input.shipDate ? {ShipDate: input.shipDate} : {})});
    const saved = await json(ship.updateMaster(master(ds, 0, false, positive(one(ds, 'ShipHead').BTCustNum, 'bill-to customer'))), 'Save shipment header');
    // Capture assigned identity even if a subsequent warning fails validation.
    const candidate = rows(dataset(saved), 'ShipHead').find(r => typeof r.PackNum === 'number' && r.PackNum > 0);
    if (candidate) { packNum = positive(candidate.PackNum, 'pack number'); progress.packNum = packNum; }
    assertMasterSave(saved);
    if (!packNum) throw new Error('Header save returned no pack number.');
    shipment = returned(await json(ship.getById(packNum), 'Read saved header'));
    identity(one(shipment, 'ShipHead'), {Company: input.company, PackNum: packNum,
      ShipStatus: 'OPEN', ShipViaCode: input.shipVia, PkgCode: input.packageCode,
      Weight: input.weight, WeightUOM: 'LB', UseBlindShipping: input.blindShipping});
    if (input.shipToCode !== undefined) identity(one(shipment, 'ShipHead'), {ShipToNum: input.shipToCode});
    if (input.shipDate !== undefined) identity(one(shipment, 'ShipHead'), {ShipDate: input.shipDate});
    if (rows(shipment, 'ShipDtl').length) throw new Error('Unexpected lines on newly created pack.');
  });
  await run('Create and verify shipment line with the picked quantity', async () => {
    let ds = dataset(await json(ship.getNewOrdrShipDtl(packNum, 0, shipment), 'Initialize shipment line'));
    const info = await json(ship.getOrderInfo(String(picked.orderNum), ds), 'Set line order');
    stringsEmpty(parameters(info), ['creditMessage']);
    ds = dataset(await json(ship.afterChangedShipDtlOrderNum(String(picked.orderNum), packNum, dataset(info)), 'Apply line order'));
    ds = dataset(await json(ship.getOrderLineInfo(0, String(picked.orderLine), picked.partNum, ds), 'Set shipment order line'));
    const check = parameters(await json(ship.checkPrePartInfo(picked.orderNum, String(picked.orderLine), ''), 'Check shipment part'));
    identity(check, {partNum: picked.partNum, origPartNum: picked.partNum, vSubAvail: false});
    stringsEmpty(check, ['vMsgText', 'vMsgType']);
    ds = dataset(await json(ship.getOrderRelInfo(0, String(picked.orderRelease), true, ds), 'Set shipment release'));
    ds = dataset(await json(ship.getWhseInfo(0, input.toWhse, 'WarehouseCode', ds), 'Set shipping warehouse'));
    await json(ship.validateBinCode(input.toWhse, input.toBin), 'Validate shipping bin');
    ds = changed(ds, 'ShipDtl', {BinNum: input.toBin});
    ds = await prepareNewShipmentQuantity(client, ds, input.quantity);
    identity(one(ds, 'ShipDtl'), {OrderNum: picked.orderNum, OrderLine: picked.orderLine,
      OrderRelNum: picked.orderRelease, PartNum: picked.partNum, WarehouseCode: input.toWhse,
      BinNum: input.toBin, OurInventoryShipQty: input.quantity});
    // Captured new line has selling quantity 0; UpdateMaster populates it.
    const saved = await json(ship.updateMaster(master(ds, packNum, true, positive(one(shipment, 'ShipHead').BTCustNum, 'bill-to customer'))), 'Save shipment line');
    // Always inspect persisted state once; a multi-call save can persist despite warnings.
    shipment = returned(await json(ship.getById(packNum), 'Read saved shipment line'));
    assertMasterSave(saved);
    identity(one(shipment, 'ShipDtl'), {OrderNum: picked.orderNum, OrderLine: picked.orderLine,
      OrderRelNum: picked.orderRelease, PartNum: picked.partNum, WarehouseCode: input.toWhse,
      BinNum: input.toBin, OurInventoryShipQty: input.quantity, SellingInventoryShipQty: input.quantity});
  });
  if(picked.savedOrderCustomerPart !== undefined) identity(one(shipment, 'ShipDtl'), {XPartNum: picked.savedOrderCustomerPart});
  if(input.internalPartRevision!==undefined) identity(one(shipment,'ShipDtl'),{RevisionNum:input.internalPartRevision});
  if(input.customerPartCode !== undefined) identity(one(shipment,'ShipDtl'),{XPartNum:input.customerPartCode,...(input.customerPartRevision!==undefined?{XRevisionNum:input.customerPartRevision}:{})});
  return {...picked, packNum: positive(packNum, 'prepared pack'), shipment};
}
function master(ds: Dataset, packNum: number, checkLine: boolean, billToCustomer: number) {
  return {ds, doValidateCreditHold: false, doCheckShipDtl: checkLine, doLotValidation: false,
    doCheckOrderComplete: false, doPostUpdate: false, doCheckCompliance: false,
    ipShippedFlagChanged: false, ipPackNum: packNum, ipBTCustNum: billToCustomer};
}
