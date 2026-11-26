import { verifySelectedCustomerPart } from './customerProductCode';
import { requirePreparationIdentity } from './scenarioPreflight';
import type { BaseClient } from '../api/baseClient';
import type { ScenarioInput, Progress, Step, PreparedStock, PreparedOrder } from './shipmentTypes';
import { rows, one, identity, positive, parameters, dataset, returned, changed, stringsEmpty, type Dataset, type Row } from '../support/datasets';
import { json } from '../api/response';
import { SalesOrderApi } from '../api/salesOrderApi';
import { createOwnedCustomerPart } from './ownedCustomerPart';

export type SalesOrderInput = Pick<ScenarioInput, 'company' | 'createOwnedMapping' | 'customerId' | 'customerPartCode' | 'customerPartRevision' | 'fromWhse' | 'internalPartRevision' | 'plant' | 'quantity' | 'shipToCode' | 'unitPrice'>;

/** Preserve server defaults and complete datasets across order change/save methods. */
export async function prepareScenarioOrder(client: BaseClient, input: SalesOrderInput, stock: PreparedStock, run: Step, progress: Progress, readyToFulfill: boolean): Promise<PreparedOrder> {
  requirePreparationIdentity(stock, 'order');
  if (stock.company !== input.company || stock.plant !== input.plant) throw new Error('Prepared stock scope differs from order input. No order operation started.');
  progress.partNum = stock.partNum;
  progress.inventoryTransactions = stock.inventoryTransactions;
  const order = new SalesOrderApi(client);
  let orderDs: Dataset = {};
  let savedOrderCustomerPart: string | undefined;
  await run('Create order, line and release using this run’s part and quantity', async () => {
    orderDs = dataset(await json(order.getNewOrderHed({}), 'Initialize order'));
    orderDs = dataset(await json(order.changeSoldToID(changed(orderDs, 'OrderHed', {CustomerCustID: input.customerId})), 'Set customer'));
    identity(one(orderDs, 'OrderHed'), {Company: input.company, CustomerCustID: input.customerId});
    if (input.shipToCode !== undefined) {
      orderDs = dataset(await json(order.changeShipToId(changed(orderDs, 'OrderHed', {ShipToNum: input.shipToCode})), 'Source 12: select VAT ship-to'));
      identity(one(orderDs, 'OrderHed'), {ShipToNum: input.shipToCode});
    }
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
    orderDs = dataset(await json(order.update(changed(orderDs, 'OrderHed', {NeedByDate: `${today}T00:00:00`})), 'Save order'));
    progress.orderNum = positive(one(orderDs, 'OrderHed').OrderNum, 'order number');
    if (input.shipToCode !== undefined) {
      const persisted = returned(await json(order.getById(progress.orderNum), 'Source 12: independently verify order ship-to'));
      identity(one(persisted, 'OrderHed'), {CustomerCustID: input.customerId, ShipToNum: input.shipToCode});
    }
    orderDs = dataset(await json(order.getNewOrderDtl(progress.orderNum, orderDs), 'Initialize order line'));
    const line = one(orderDs, 'OrderDtl');
    if(input.createOwnedMapping) {
      progress.customerPartCode = input.customerPartCode;
      if(input.customerPartCode===undefined||input.customerPartRevision===undefined||input.internalPartRevision===undefined)throw new Error('Explicit customer code and revision required.');
      const custNum=one(orderDs,'OrderHed').CustNum;
      if(typeof custNum!=='number'||custNum<=0)throw new Error('Returned order customer identity missing.');
      progress.customerPartMappingId=await createOwnedCustomerPart(client,input.company,custNum,stock.partNum,input.customerPartCode,input.customerPartRevision,input.internalPartRevision);
    }
    if(input.internalPartRevision!==undefined) orderDs=changed(orderDs,'OrderDtl',{RevisionNum:input.internalPartRevision});
    const partBody = await json(order.changePartNumMaster({
      partNum: stock.partNum, lSubstitutePartExist: false, lIsPhantom: false, uomCode: '',
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
      verifySelectedCustomerPart(orderDs, {partNum: stock.partNum, code: input.customerPartCode, revision: input.customerPartRevision});
    }
    const quantityBody = await json(order.changeSellingQtyMaster({
      ipSellingQuantity: String(input.quantity), chkSellQty: false, negInvTest: false, chgSellQty: true,
      chgDiscPer: true, lKeepUnitPrice: true, pcAttributeSetID: '0', pcBinNum: '', pcDimCode: 'EA',
      pcLotNum: '', pcPartNum: stock.partNum, pcWhseCode: '', pdDimConvFactor: '1',
      suppressUserPrompts: false, ds: orderDs,
    }), 'Set order quantity');
    stringsEmpty(parameters(quantityBody), ['pcMessage','pcNeqQtyAction','opWarningMsg','cSellingQuantityChangedMsgText']);
    orderDs = dataset(await json(order.update(dataset(quantityBody)), 'Save order line'));
    const saved = one(orderDs, 'OrderDtl');
    identity(saved, {Company: input.company, OrderNum: progress.orderNum, PartNum: stock.partNum,
      SellingQuantity: input.quantity, OrderQty: input.quantity, SalesUM: 'EA', UnitPrice: input.unitPrice});
    progress.orderLine = positive(saved.OrderLine, 'order line');
    if(input.customerPartCode !== undefined) {
      const persisted=returned(await json(order.getById(progress.orderNum!), 'Source 12: independently read saved customer part'));
      const line=rows(persisted,'OrderDtl').filter(r=>r.OrderNum===progress.orderNum && r.OrderLine===progress.orderLine);
      if(line.length!==1) throw new Error('Expected exact persisted order line.');
      if(input.internalPartRevision!==undefined) identity(line[0],{RevisionNum:input.internalPartRevision});
      identity(line[0],{PartNum:stock.partNum,XPartNum:input.customerPartCode,...(input.customerPartRevision!==undefined?{XRevisionNum:input.customerPartRevision}:{})});
    }
    if (input.shipToCode !== undefined) {
      const persisted = returned(await json(order.getById(progress.orderNum!), 'Source 13: independently verify order line customer part'));
      const savedLine = rows(persisted, 'OrderDtl').filter(r => r.OrderLine === progress.orderLine);
      if (savedLine.length !== 1 || typeof savedLine[0].XPartNum !== 'string') throw new Error('Missing persisted order customer part field.');
      savedOrderCustomerPart = savedLine[0].XPartNum;
    }
    const release = one(orderDs, 'OrderRel');
    identity(release, {OrderNum: progress.orderNum, OrderLine: progress.orderLine,
      Plant: input.plant, WarehouseCode: input.fromWhse, OurReqQty: input.quantity});
    if (input.shipToCode !== undefined) identity(release, {ShipToNum: input.shipToCode});
    progress.orderRelease = positive(release.OrderRelNum, 'order release');
  });
  if (readyToFulfill) await run('S7: mark Ready to fulfill and independently read', async () => {
    orderDs = returned(await json(order.getById(progress.orderNum!), 'Read order before ready-to-fulfill save'));
    await json(order.update(changed(orderDs, 'OrderHed', {ReadyToFulfill: true})), 'Save ready-to-fulfill');
    orderDs = returned(await json(order.getById(progress.orderNum!), 'Read persisted ready-to-fulfill'));
    identity(one(orderDs, 'OrderHed'), {Company: input.company, OrderNum: progress.orderNum,
      CustomerCustID: input.customerId, ReadyToFulfill: true,
      ...(input.shipToCode !== undefined ? {ShipToNum: input.shipToCode} : {})});
    identity(one(orderDs, 'OrderDtl'), {PartNum: stock.partNum, OrderNum: progress.orderNum,
      OrderLine: progress.orderLine, OrderQty: input.quantity, SellingQuantity: input.quantity});
  });
  return {...stock, quantity: input.quantity, orderNum: positive(progress.orderNum, 'saved order'), orderLine: positive(progress.orderLine, 'saved line'),
    orderRelease: positive(progress.orderRelease, 'saved release'), savedOrderCustomerPart};
}
