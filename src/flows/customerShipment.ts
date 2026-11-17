import {createOwnedCustomerPart} from './ownedCustomerPart';
import {verifyMovedQueueAbsent} from './productCodeReaders';
import { FulfillmentApi } from '../api/fulfillmentApi';
import { BaseClient } from '../api/baseClient';
import { PartApi } from '../api/partApi';
import { InventoryApi } from '../api/inventoryApi';
import { SalesOrderApi } from '../api/salesOrderApi';


import { ShipmentApi } from '../api/customerShipmentApi';
import { FreightApi } from '../api/freightApi';
import { buildPurchasedStockPart } from '../flows/purchasedPart';
import { buildAllocationTemplateRows } from '../flows/allocationTemplate';
import type { Dataset, Row } from '../support/datasets';
import * as fulfillment from './fulfillment';
import { prepareNewShipmentQuantity } from '../api/customerShipmentApi';
import { readFreightResult } from '../api/freightApi';
import { json, rows, one, identity, positive, parameters, dataset, returned, changed, stringsEmpty, assertMasterSave } from '../support/datasets';

export interface ScenarioInput {
  company: string; customerId: string; employeeId: string; plant: string;
  fromWhse: string; fromBin: string; toWhse: string; toBin: string;
  stockQty: number; quantity: number; shipVia: string; packageCode: string;
  weight: number; unitPrice: number; tariff: string; blindShipping: boolean;
  freightUrl: string; workstation: string; freightTimeout: number;
  partExtras: Row;
  customerPartCode?: string;
  customerPartRevision?: string;
  internalPartRevision?: string;
  createOwnedMapping?: boolean;
}
export interface Progress {
  customerPartMappingId?: string;
  stage: string; partNum?: string; orderNum?: number; orderLine?: number;
  orderRelease?: number; queueSeq?: number; packNum?: number;
  inventoryTransactions?: string; movementTransactions?: string; freightTransaction?: string;
}
type Step = <T>(name: string, action: () => Promise<T>) => Promise<T>;

async function executeShipment(
  client: BaseClient, input: ScenarioInput,
  step: Step, progress: Progress, preparationOnly = false,
): Promise<{progress: Progress; shipment: Dataset; freightRequest: Dataset}> {
  const part = new PartApi(client, input.company);
  const inv = new InventoryApi(client);
  const order = new SalesOrderApi(client);
  const alloc = new FulfillmentApi(client);
  const pick = new FulfillmentApi(client);
  const movement = new FulfillmentApi(client);
  const ship = new ShipmentApi(client);
  const freight = new FreightApi(client);
  const run: Step = async (name, action) => {
    progress.stage = `started: ${name}`;
    const result = await step(name, action);
    progress.stage = `completed: ${name}`;
    console.log('Retained run checkpoint:', JSON.stringify(progress));
    return result;
  };
  const stock = async () => rows(returned(await json(movement.stock(progress.partNum!), 'Read stock')), 'PartBinSearch')
    .filter(r => r.Company === input.company && r.PartNum === progress.partNum && r.Plant === input.plant);
  const balance = (all: Row[], whse: string, bin: string): number => {
    const matching = all.filter(r => r.WhseCode === whse && r.BinNum === bin && r.IUM === 'EA' &&
      r.AttributeSetID === 0 && r.LotNumber === '' && r.PCID === '');
    if (matching.length !== 1 || typeof matching[0].QtyOnHand !== 'number') throw new Error('Expected one exact stock row; missing row is not assumed zero.');
    return matching[0].QtyOnHand;
  };
  await run('Create and verify unique purchased stock part', async () => {
    const generated = buildPurchasedStockPart(input.company);
    const payload = {...generated, ...input.partExtras, UnitPrice: input.unitPrice, SchedBcode: input.tariff};
    // Never allow extras to override the generated identity or simple-stock model.
    Object.assign(payload, {Company: input.company, PartNum: generated.PartNum,
      IUM: 'EA', PUM: 'EA', SalesUM: 'EA', TypeCode: 'P', NonStock: false, QtyBearing: true});
    progress.partNum = payload.PartNum;
    console.log('New run part:', progress.partNum);
    await json(part.createPart(payload), 'Create part', 201);
    const saved = await json(part.getPart(payload.PartNum), 'Read part');
    identity(saved, payload);
    // Price 0 is intentional for this POC. Extra create fields are verified by read-back.
    // SchedBcode on the create payload is an extension requiring the first live validation.
    identity(saved, {UnitPrice: input.unitPrice, SchedBcode: input.tariff});
    for (const key of ['TrackLots','TrackSerialNum','TrackDimension','TrackInventoryAttributes','TrackInventoryByRevision']) {
      if (saved[key] === true) throw new Error(`Simple-stock scenario does not support ${key}.`);
    }
  });
  await run('Add stock and verify persisted source balance', async () => {
    let ds = returned(await json(inv.getInventoryQtyAdj(progress.partNum!, 'EA'), 'Initialize adjustment'));
    ds = changed(ds, 'InventoryQtyAdj', {});
    ds = dataset(await json(inv.onChangeWareHseCode(input.fromWhse, ds), 'Set stock warehouse'));
    ds = dataset(await json(inv.onChangeBinNum(input.fromBin, ds), 'Set stock bin'));
    identity(one(ds, 'InventoryQtyAdj'), {Company: input.company, PartNum: progress.partNum,
      WareHseCode: input.fromWhse, BinNum: input.fromBin, UnitOfMeasure: 'EA', OnHandQty: 0});
    ds = dataset(await json(inv.onChangingAdjustQuantity(input.stockQty, ds), 'Set stock quantity'));
    ds = changed(ds, 'InventoryQtyAdj', {ReasonCode: 'ADD'});
    const prepared = await json(inv.preSetInventoryQtyAdj(ds), 'Prepare stock');
    if (parameters(prepared).requiresUserInput !== false) throw new Error('Stock preparation requires review.');
    ds = dataset(prepared);
    identity(one(ds, 'InventoryQtyAdj'), {Company: input.company, PartNum: progress.partNum,
      WareHseCode: input.fromWhse, BinNum: input.fromBin, UnitOfMeasure: 'EA', ReasonCode: 'ADD',
      OnHandQty: 0, AdjustQuantity: input.stockQty, NewOnHandQty: input.stockQty});
    const result = parameters(await json(inv.setInventoryQtyAdj(ds), 'Commit stock'));
    if (typeof result.partTranPKs !== 'string' || !result.partTranPKs) throw new Error('Missing stock transaction references.');
    progress.inventoryTransactions = result.partTranPKs;
    if (balance(await stock(), input.fromWhse, input.fromBin) !== input.stockQty) throw new Error('Persisted source stock mismatch.');
  });
  let orderDs: Dataset = {};
  await run('Create order, line and release using this run’s part and quantity', async () => {
    orderDs = dataset(await json(order.getNewOrderHed({}), 'Initialize order'));
    orderDs = dataset(await json(order.changeSoldToID(changed(orderDs, 'OrderHed', {CustomerCustID: input.customerId})), 'Set customer'));
    identity(one(orderDs, 'OrderHed'), {Company: input.company, CustomerCustID: input.customerId});
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
    orderDs = dataset(await json(order.update(changed(orderDs, 'OrderHed', {NeedByDate: `${today}T00:00:00`})), 'Save order'));
    progress.orderNum = positive(one(orderDs, 'OrderHed').OrderNum, 'order number');
    orderDs = dataset(await json(order.getNewOrderDtl(progress.orderNum, orderDs), 'Initialize order line'));
    const line = one(orderDs, 'OrderDtl');
    if(input.createOwnedMapping) {
      if(input.customerPartCode===undefined||input.customerPartRevision===undefined||input.internalPartRevision===undefined)throw new Error('Explicit customer code and revision required.');
      const custNum=one(orderDs,'OrderHed').CustNum;
      if(typeof custNum!=='number'||custNum<=0)throw new Error('Returned order customer identity missing.');
      progress.customerPartMappingId=await createOwnedCustomerPart(client,input.company,custNum,progress.partNum!,input.customerPartCode,input.customerPartRevision,input.internalPartRevision);
    }
    if(input.internalPartRevision!==undefined) orderDs=changed(orderDs,'OrderDtl',{RevisionNum:input.internalPartRevision});
    const partBody = await json(order.changePartNumMaster({
      partNum: progress.partNum!, lSubstitutePartExist: false, lIsPhantom: false, uomCode: '',
      SysRowID: String(line.SysRowID), rowType: '', salesKitView: false, removeKitComponents: false,
      suppressUserPrompts: false, getPartXRefInfo: true, checkPartRevisionChange: true,
      checkChangeKitParent: true, checkPartSaleable: true, ds: orderDs,
    }), 'Set order part');
    const pp = parameters(partBody);
    stringsEmpty(pp, ['cDeleteComponentsMessage','cWarningMessage','cConfigPartMessage','cSubPartMessage',
      'explodeBOMerrMessage','cMsgType','cMsgTypeSaleable']);
    if (pp.questionString !== '' && pp.questionString !== 'PART') throw new Error('Unexpected part question.');
    for (const flag of ['lSubstitutePartExist','lIsPhantom','multipleMatch','promptToExplodeBOM','multiSubsAvail','runOutQtyAvail']) {
      if (pp[flag] === true) throw new Error(`Part condition requires review: ${flag}.`);
    }
    orderDs = dataset(partBody);
    if(input.internalPartRevision!==undefined) identity(one(orderDs,'OrderDtl'),{RevisionNum:input.internalPartRevision});
    if(input.customerPartCode !== undefined) {
      orderDs = dataset(await json(order.changeXPartNum(changed(orderDs,'OrderDtl',{XPartNum:input.customerPartCode,...(input.customerPartRevision!==undefined?{XRevisionNum:input.customerPartRevision}:{})})), 'Source 12: select customer part'));
      identity(one(orderDs,'OrderDtl'),{PartNum:progress.partNum,XPartNum:input.customerPartCode,...(input.customerPartRevision!==undefined?{XRevisionNum:input.customerPartRevision}:{})});
    }
    const quantityBody = await json(order.changeSellingQtyMaster({
      ipSellingQuantity: String(input.quantity), chkSellQty: false, negInvTest: false, chgSellQty: true,
      chgDiscPer: true, lKeepUnitPrice: true, pcAttributeSetID: '0', pcBinNum: '', pcDimCode: 'EA',
      pcLotNum: '', pcPartNum: progress.partNum!, pcWhseCode: '', pdDimConvFactor: '1',
      suppressUserPrompts: false, ds: orderDs,
    }), 'Set order quantity');
    stringsEmpty(parameters(quantityBody), ['pcMessage','pcNeqQtyAction','opWarningMsg','cSellingQuantityChangedMsgText']);
    orderDs = dataset(await json(order.update(dataset(quantityBody)), 'Save order line'));
    const saved = one(orderDs, 'OrderDtl');
    identity(saved, {Company: input.company, OrderNum: progress.orderNum, PartNum: progress.partNum,
      SellingQuantity: input.quantity, OrderQty: input.quantity, SalesUM: 'EA', UnitPrice: input.unitPrice});
    progress.orderLine = positive(saved.OrderLine, 'order line');
    if(input.customerPartCode !== undefined) {
      const persisted=returned(await json(order.getById(progress.orderNum!), 'Source 12: independently read saved customer part'));
      const line=rows(persisted,'OrderDtl').filter(r=>r.OrderNum===progress.orderNum && r.OrderLine===progress.orderLine);
      if(line.length!==1) throw new Error('Expected exact persisted order line.');
      if(input.internalPartRevision!==undefined) identity(line[0],{RevisionNum:input.internalPartRevision});
      identity(line[0],{PartNum:progress.partNum,XPartNum:input.customerPartCode,...(input.customerPartRevision!==undefined?{XRevisionNum:input.customerPartRevision}:{})});
    }
    const release = one(orderDs, 'OrderRel');
    identity(release, {OrderNum: progress.orderNum, OrderLine: progress.orderLine,
      Plant: input.plant, WarehouseCode: input.fromWhse, OurReqQty: input.quantity});
    progress.orderRelease = positive(release.OrderRelNum, 'order release');
  });
  await run('Allocate and release this order for picking', async () => {
    const demand = await json(alloc.getListFWB(progress.orderNum!), 'Read allocation demand');
    if (parameters(demand).morePages !== false) throw new Error('Allocation demand pagination requires handling.');
    let ds = returned(await json(alloc.mergeOrderAllocListsAndGetRows(returned(demand)), 'Read allocation rows'));
    identity(one(ds, 'OrderAlloc'), {Company: input.company, OrderNum: progress.orderNum,
      OrderLine: progress.orderLine, OrderRelNum: progress.orderRelease, PartNum: progress.partNum,
      Plant: input.plant, WarehouseCode: input.fromWhse, OurReqQty: input.quantity});
    ds = changed(ds, 'OrderAlloc', {SelectedForAction: true, FulfillmentSeq: 1});
    const slim = await json(alloc.getSlimOrderAlloc(ds), 'Prepare allocation');
    ds = dataset(slim);
    const dates = await json(alloc.checkDates(returned(slim)), 'Check allocation dates');
    stringsEmpty(parameters(dates), ['cMessageText']);
    ds = changed(ds, 'OrderAlloc', {SelectedForAction: true, FulfillmentSeq: 1}, true);
    ds.PartAllocTran = buildAllocationTemplateRows(input.company);
    const result = parameters(await json(alloc.autoAllocation(ds), 'Allocate and release'));
    if (result.lReleased !== true) throw new Error('Order was not released for picking.');
    const expected = ['1 Demand record(s) allocated.','0 Demand record(s) cross docked.',
      '1 Demand record(s) selected for picking.','1 Demand record(s) submitted for picking.'].join('\n');
    if (typeof result.cMessageText !== 'string' || result.cMessageText.replace(/\r\n/g,'\n').trim() !== expected) throw new Error('Unexpected allocation outcome.');
  });
  await run('Discover, select and move the new queue to shipping', async () => {
    const lookup = await json(movement.findQueue(progress.orderNum!, input.employeeId), 'Find new queue');
    if (parameters(lookup).morePages !== false) throw new Error('Queue query is incomplete.');
    const matches = rows(returned(lookup), 'MtlQueue').filter(r => r.Company === input.company &&
      r.OrderNum === progress.orderNum && r.OrderLine === progress.orderLine &&
      r.OrderRelNum === progress.orderRelease && r.PartNum === progress.partNum && r.TranType === 'STK-SHP');
    if (matches.length !== 1) throw new Error('Expected exactly one queue for the new order release.');
    let queue = matches[0];
    identity(queue, {Plant: input.plant, Quantity: input.quantity, IUM: 'EA', TranStatus: 'RELEASED',
      FromWhse: input.fromWhse, FromBinNum: input.fromBin, ToWhse: input.toWhse, ToBinNum: input.toBin});
    if (queue.SelectedByEmpID && queue.SelectedByEmpID !== input.employeeId) throw new Error('Queue selected by another employee.');
    progress.queueSeq = positive(queue.MtlQueueSeq, 'queue sequence');
    const selected = await json(movement.select(queue, input.employeeId), 'Select queue');
    queue = one(dataset(selected), 'MtlQueue');
    identity(queue, {MtlQueueSeq: progress.queueSeq, SelectedByEmpID: input.employeeId, SelectedForProcessing: true});
    await fulfillment.beforeInitialize(client, queue);
    if (typeof queue.SysRowID !== 'string' || !queue.SysRowID) throw new Error('Queue identity missing.');
    let ds = dataset(await json(pick.getNewIssueReturn(queue.SysRowID), 'Initialize movement'));
    identity(one(ds, 'IssueReturn'), {Company: input.company, PartNum: progress.partNum,
      OrderNum: progress.orderNum, OrderLine: progress.orderLine, OrderRel: progress.orderRelease,
      MtlQueueRowId: queue.SysRowID, TranQty: input.quantity, RequirementQty: input.quantity,
      FromWarehouseCode: input.fromWhse, FromBinNum: input.fromBin,
      ToWarehouseCode: input.toWhse, ToBinNum: input.toBin, UM: 'EA', TranType: 'STK-SHP', RowMod: 'A'});
    const before = await stock();
    const sourceBefore = balance(before, input.fromWhse, input.fromBin);
    if (sourceBefore < input.quantity) throw new Error('Insufficient source stock.');
    const destBeforeRows = before.filter(r => r.WhseCode === input.toWhse && r.BinNum === input.toBin);
    // A fresh unique part must have no unexpected stock at shipping before its first movement.
    if (destBeforeRows.length) throw new Error('Unexpected preexisting destination stock for new part.');
    ds = await fulfillment.verifyQueueBeforeMovement(client, queue, ds);
    const prepared = await json(movement.prepare(ds), 'Prepare movement');
    if (parameters(prepared).requiresUserInput !== false) throw new Error('Movement preparation requires user input.');
    const checked = await json(movement.binTests(dataset(prepared)), 'Check movement bins');
    stringsEmpty(parameters(checked), ['pcNeqQtyAction','pcNeqQtyMessage','pcPCBinAction','pcPCBinMessage','pcOutBinAction','pcOutBinMessage']);
    ds = dataset(checked);
    await json(movement.lock(progress.queueSeq, input.employeeId), 'Lock queue');
    const moved = parameters(await json(movement.move(ds), 'Commit movement'));
    stringsEmpty(moved, ['legalNumberMessage']);
    if (typeof moved.partTranPKs !== 'string' || !moved.partTranPKs) throw new Error('Missing movement transaction references.');
    progress.movementTransactions = moved.partTranPKs;
    if(input.customerPartCode !== undefined) verifyMovedQueueAbsent(await json(movement.findQueue(progress.orderNum!,input.employeeId),'Source 20: independently verify moved queue disappearance'),input.company,progress.queueSeq!);
    const after = await stock();
    if (balance(after, input.fromWhse, input.fromBin) !== sourceBefore - input.quantity ||
        balance(after, input.toWhse, input.toBin) !== input.quantity) throw new Error('Post-movement stock mismatch.');
    // No-row before is recorded as absence, not promoted to a general zero-balance rule.
  });
  let shipment: Dataset = {};
  await run('Create shipment header and save its new pack number', async () => {
    let ds = dataset(await json(ship.getNewShipHead({}), 'Initialize shipment'));
    const info = await json(ship.getHeadOrderInfo(progress.orderNum!, ds), 'Set shipment order');
    stringsEmpty(parameters(info), ['creditMessage']);
    ds = dataset(info);
    identity(one(ds, 'ShipHead'), {Company: input.company, OrderNum: progress.orderNum,
      CustomerCustID: input.customerId, Plant: input.plant, CreditHold: false, OrderHold: false});
    ds = dataset(await json(ship.onChangeShipViaCode(input.shipVia, changed(ds, 'ShipHead', {ShipViaCode: input.shipVia})), 'Set shipment carrier'));
    ds = dataset(await json(ship.getPackaging(input.packageCode, ds), 'Set shipment package'));
    ds = changed(ds, 'ShipHead', {Weight: input.weight, WeightUOM: 'LB', UseBlindShipping: input.blindShipping});
    const saved = await json(ship.updateMaster(master(ds, 0, false, positive(one(ds, 'ShipHead').BTCustNum, 'bill-to customer'))), 'Save shipment header');
    // Capture assigned identity even if a subsequent warning fails validation.
    const candidate = rows(dataset(saved), 'ShipHead').find(r => typeof r.PackNum === 'number' && r.PackNum > 0);
    if (candidate) progress.packNum = positive(candidate.PackNum, 'pack number');
    assertMasterSave(saved);
    if (!progress.packNum) throw new Error('Header save returned no pack number.');
    shipment = returned(await json(ship.getById(progress.packNum), 'Read saved header'));
    identity(one(shipment, 'ShipHead'), {Company: input.company, PackNum: progress.packNum,
      ShipStatus: 'OPEN', ShipViaCode: input.shipVia, PkgCode: input.packageCode,
      Weight: input.weight, WeightUOM: 'LB', UseBlindShipping: input.blindShipping});
    if (rows(shipment, 'ShipDtl').length) throw new Error('Unexpected lines on newly created pack.');
  });
  await run('Create and verify shipment line with the picked quantity', async () => {
    let ds = dataset(await json(ship.getNewOrdrShipDtl(progress.packNum!, 0, shipment), 'Initialize shipment line'));
    const info = await json(ship.getOrderInfo(String(progress.orderNum), ds), 'Set line order');
    stringsEmpty(parameters(info), ['creditMessage']);
    ds = dataset(await json(ship.afterChangedShipDtlOrderNum(String(progress.orderNum), progress.packNum!, dataset(info)), 'Apply line order'));
    ds = dataset(await json(ship.getOrderLineInfo(0, String(progress.orderLine), progress.partNum!, ds), 'Set shipment order line'));
    const check = parameters(await json(ship.checkPrePartInfo(progress.orderNum!, String(progress.orderLine), ''), 'Check shipment part'));
    identity(check, {partNum: progress.partNum, origPartNum: progress.partNum, vSubAvail: false});
    stringsEmpty(check, ['vMsgText', 'vMsgType']);
    ds = dataset(await json(ship.getOrderRelInfo(0, String(progress.orderRelease), true, ds), 'Set shipment release'));
    ds = dataset(await json(ship.getWhseInfo(0, input.toWhse, 'WarehouseCode', ds), 'Set shipping warehouse'));
    await json(ship.validateBinCode(input.toWhse, input.toBin), 'Validate shipping bin');
    ds = changed(ds, 'ShipDtl', {BinNum: input.toBin});
    ds = await prepareNewShipmentQuantity(client, ds, input.quantity);
    identity(one(ds, 'ShipDtl'), {OrderNum: progress.orderNum, OrderLine: progress.orderLine,
      OrderRelNum: progress.orderRelease, PartNum: progress.partNum, WarehouseCode: input.toWhse,
      BinNum: input.toBin, OurInventoryShipQty: input.quantity});
    // Captured new line has selling quantity 0; UpdateMaster populates it.
    const saved = await json(ship.updateMaster(master(ds, progress.packNum!, true, positive(one(shipment, 'ShipHead').BTCustNum, 'bill-to customer'))), 'Save shipment line');
    // Always inspect persisted state once; a multi-call save can persist despite warnings.
    shipment = returned(await json(ship.getById(progress.packNum!), 'Read saved shipment line'));
    assertMasterSave(saved);
    identity(one(shipment, 'ShipDtl'), {OrderNum: progress.orderNum, OrderLine: progress.orderLine,
      OrderRelNum: progress.orderRelease, PartNum: progress.partNum, WarehouseCode: input.toWhse,
      BinNum: input.toBin, OurInventoryShipQty: input.quantity, SellingInventoryShipQty: input.quantity});
  });
  if(input.internalPartRevision!==undefined) identity(one(shipment,'ShipDtl'),{RevisionNum:input.internalPartRevision});
  if(input.customerPartCode !== undefined) identity(one(shipment,'ShipDtl'),{XPartNum:input.customerPartCode,...(input.customerPartRevision!==undefined?{XRevisionNum:input.customerPartRevision}:{})});
  if (preparationOnly) {
    identity(one(shipment, 'ShipHead'), {ShipStatus: 'OPEN'});
    progress.stage = 'completed: OPEN pack preparation boundary';
    return {progress, shipment, freightRequest: {}};
  }
  await run('Close and independently verify CLOSED status', async () => {
    const header = one(shipment, 'ShipHead');
    if (typeof header.SysRowID !== 'string' || !header.SysRowID) throw new Error('Missing saved header identity.');
    await json(ship.closeShipment(header.SysRowID), 'Close shipment');
    shipment = returned(await json(ship.getById(progress.packNum!), 'Verify closed shipment'));
    identity(one(shipment, 'ShipHead'), {ShipStatus: 'CLOSED'});
  });
  let freightRequest: Dataset = {};
  await run('Build, freight and persist this shipment once', async () => {
    await json(ship.convertToManifestUOM(progress.packNum!), 'Convert manifest UOM');
    await json(freight.getFreightTimeout(), 'Read freight timeout');
    freightRequest = returned(await json(freight.buildCustomerFreightRequest(progress.packNum!), 'Build freight request'));
    const pack = one(freightRequest, 'PackInfo');
    identity(pack, {Company: input.company, PackID: progress.packNum, FreightCarrier: input.shipVia,
      Weight: input.weight, WeightUOM: 'LB', PkgCode: input.packageCode});
    // Only the independently controlled customer=false branch is implemented; no shared-customer mutation.
    identity(pack, {SoldToUseBlindShipping: false});
    identity(one(freightRequest, 'OrderLine'), {PartNum: progress.partNum, QtyShip: input.quantity,
      QTYShipUOM: 'EA', UnitPrice: input.unitPrice, SchedBcode: input.tariff});
    const result = await json(freight.freightCarton(freightRequest, input.freightUrl, input.workstation, input.freightTimeout), 'Freight carton');
    const freightDs = readFreightResult(result, progress.packNum!);
    const expectedTransaction = String(one(freightDs, 'FreightCartonResponse').TransactionNumber);
    const expectedTracking = one(freightDs, 'FreightCartonResponseTracking').TrackingNumber;
    progress.freightTransaction = expectedTransaction;
    await json(freight.updateFreightedShipment(progress.packNum!, freightDs), 'Persist freight result');
    shipment = returned(await json(ship.getById(progress.packNum!), 'Verify freighted shipment'));
    const header = one(shipment, 'ShipHead');
    identity(header, {Company: input.company, PackNum: progress.packNum, ShipStatus: 'FREIGHTED', UseBlindShipping: input.blindShipping,
      MFTransNum: expectedTransaction, TrackingNumber: expectedTracking});
    if (typeof header.TrackingNumber !== 'string' || !header.TrackingNumber.trim() || !String(header.MFTransNum ?? '').trim()) throw new Error('Missing tracking or freight transaction.');
    progress.freightTransaction = String(header.MFTransNum);
  });
  return {progress, shipment, freightRequest};
}
function master(ds: Dataset, packNum: number, checkLine: boolean, billToCustomer: number) {
  return {ds, doValidateCreditHold: false, doCheckShipDtl: checkLine, doLotValidation: false,
    doCheckOrderComplete: false, doPostUpdate: false, doCheckCompliance: false,
    ipShippedFlagChanged: false, ipPackNum: packNum, ipBTCustNum: billToCustomer};
}

export async function prepareCustomerShipment(client: BaseClient, input: ScenarioInput, step: Step, progress: Progress) {
  return executeShipment(client, input, step, progress, true);
}
export async function customerShipment(client: BaseClient, input: ScenarioInput, step: Step, progress: Progress) {
  return executeShipment(client, input, step, progress);
}
