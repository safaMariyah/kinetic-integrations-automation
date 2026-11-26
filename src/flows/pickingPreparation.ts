import { requirePreparationIdentity } from './scenarioPreflight';
import { readScenarioStock, exactStockBalance } from './stockPreparation';
import type { BaseClient } from '../api/baseClient';
import type { ScenarioInput, Progress, Step, PreparedOrder, PickedOrder } from './shipmentTypes';
import { rows, one, identity, positive, parameters, dataset, returned, changed, stringsEmpty, type Dataset, type Row } from '../support/datasets';
import { json } from '../api/response';
import { FulfillmentApi } from '../api/fulfillmentApi';
import { buildAllocationTemplateRows } from './allocationTemplate';
import { verifyMovedQueueAbsent } from './fulfillmentReaders';
import * as fulfillment from './fulfillment';

export type PickingInput = Pick<ScenarioInput, 'company' | 'customerPartCode' | 'employeeId' | 'fromBin' | 'fromWhse' | 'plant' | 'quantity' | 'shipToCode' | 'toBin' | 'toWhse'>;

/** Allocation and movement retain the exact order-release identities and stock checks. */
export async function prepareScenarioPicking(client: BaseClient, input: PickingInput, order: PreparedOrder, run: Step, progress: Progress): Promise<PickedOrder> {
  requirePreparationIdentity(order, 'picking');
  if (order.company !== input.company || order.plant !== input.plant) throw new Error('Prepared order scope differs from picking input. No allocation operation started.');
  if (order.quantity !== input.quantity) throw new Error('Picked quantity input differs from the saved order. No allocation operation started.');
  Object.assign(progress, {partNum: order.partNum, orderNum: order.orderNum, orderLine: order.orderLine, orderRelease: order.orderRelease, inventoryTransactions: order.inventoryTransactions});
  const alloc = new FulfillmentApi(client);
  const pick = new FulfillmentApi(client);
  const movement = new FulfillmentApi(client);
  await run('Allocate and release this order for picking', async () => {
    const demand = await json(alloc.getListFWB(order.orderNum), 'Read allocation demand');
    if (parameters(demand).morePages !== false) throw new Error('Allocation demand pagination requires handling.');
    let ds = returned(await json(alloc.mergeOrderAllocListsAndGetRows(returned(demand)), 'Read allocation rows'));
    identity(one(ds, 'OrderAlloc'), {Company: input.company, OrderNum: order.orderNum,
      OrderLine: order.orderLine, OrderRelNum: order.orderRelease, PartNum: order.partNum,
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
    const lookup = await json(movement.findQueue(order.orderNum, input.employeeId), 'Find new queue');
    if (parameters(lookup).morePages !== false) throw new Error('Queue query is incomplete.');
    const matches = rows(returned(lookup), 'MtlQueue').filter(r => r.Company === input.company &&
      r.OrderNum === order.orderNum && r.OrderLine === order.orderLine &&
      r.OrderRelNum === order.orderRelease && r.PartNum === order.partNum && r.TranType === 'STK-SHP');
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
    identity(one(ds, 'IssueReturn'), {Company: input.company, PartNum: order.partNum,
      OrderNum: order.orderNum, OrderLine: order.orderLine, OrderRel: order.orderRelease,
      MtlQueueRowId: queue.SysRowID, TranQty: input.quantity, RequirementQty: input.quantity,
      FromWarehouseCode: input.fromWhse, FromBinNum: input.fromBin,
      ToWarehouseCode: input.toWhse, ToBinNum: input.toBin, UM: 'EA', TranType: 'STK-SHP', RowMod: 'A'});
    const before = await readScenarioStock(client, input.company, input.plant, order.partNum);
    const sourceBefore = exactStockBalance(before, input.fromWhse, input.fromBin);
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
    if(input.customerPartCode !== undefined || input.shipToCode !== undefined) verifyMovedQueueAbsent(await json(movement.findQueue(order.orderNum,input.employeeId),'Source 20: independently verify moved queue disappearance'),input.company,progress.queueSeq!);
    const after = await readScenarioStock(client, input.company, input.plant, order.partNum);
    if (exactStockBalance(after, input.fromWhse, input.fromBin) !== sourceBefore - input.quantity ||
        exactStockBalance(after, input.toWhse, input.toBin) !== input.quantity) throw new Error('Post-movement stock mismatch.');
    // No-row before is recorded as absence, not promoted to a general zero-balance rule.
  });
  if (!progress.movementTransactions) throw new Error('Movement identity missing after preparation. Inspect persisted stock before recovery.');
  return {...order, shippingWarehouse: input.toWhse, shippingBin: input.toBin, queueSeq: positive(progress.queueSeq, 'saved queue'), movementTransactions: progress.movementTransactions};
}
