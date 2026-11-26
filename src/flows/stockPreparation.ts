import type { BaseClient } from '../api/baseClient';
import type { ScenarioInput, Progress, Step, PreparedStock } from './shipmentTypes';
import { rows, one, identity, positive, parameters, dataset, returned, changed, stringsEmpty, type Dataset, type Row } from '../support/datasets';
import { json } from '../api/response';
import { PartApi } from '../api/partApi';
import { InventoryApi } from '../api/inventoryApi';
import { FulfillmentApi } from '../api/fulfillmentApi';
import { buildPurchasedStockPart } from './purchasedPart';

export type StockInput = Pick<ScenarioInput, 'company' | 'fromBin' | 'fromWhse' | 'partExtras' | 'plant' | 'preparedPartNum' | 'stockQty' | 'tariff' | 'unitPrice'>;

/** Prepare a new simple-stock part, or validate an explicitly prepared one. */
export async function prepareScenarioStock(client: BaseClient, input: StockInput, run: Step, progress: Progress): Promise<PreparedStock> {
  const part = new PartApi(client, input.company);
  const inv = new InventoryApi(client);
  if (input.preparedPartNum !== undefined) {
    progress.partNum = input.preparedPartNum;
    identity(await json(part.getPart(progress.partNum), 'Read prepared scenario part'),
      {Company: input.company, PartNum: progress.partNum, IUM: 'EA', SalesUM: 'EA', NonStock: false, QtyBearing: true});
  } else await run('Create and verify unique purchased stock part', async () => {
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
    // Price and tariff remain scenario inputs; verify them through the persisted part read.
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
    if (exactStockBalance(await readScenarioStock(client, input.company, input.plant, progress.partNum!), input.fromWhse, input.fromBin) !== input.stockQty) throw new Error('Persisted source stock mismatch.');
  });
  if (!progress.partNum || !progress.inventoryTransactions) throw new Error('Stock preparation completed without retained identities. Stop dependent operations.');
  return {company: input.company, plant: input.plant, partNum: progress.partNum, inventoryTransactions: progress.inventoryTransactions};
}

/** A missing stock row is absence, never an assumed zero balance. */
export async function readScenarioStock(client: BaseClient, company: string, plant: string, partNum: string): Promise<Row[]> {
  return rows(returned(await json(new FulfillmentApi(client).stock(partNum), 'Read stock')), 'PartBinSearch')
    .filter(row => row.Company === company && row.PartNum === partNum && row.Plant === plant);
}

export function exactStockBalance(all: Row[], warehouse: string, bin: string): number {
  const matching = all.filter(row => row.WhseCode === warehouse && row.BinNum === bin && row.IUM === 'EA' &&
    row.AttributeSetID === 0 && row.LotNumber === '' && row.PCID === '');
  if (matching.length !== 1 || typeof matching[0].QtyOnHand !== 'number') {
    throw new Error('Stock verification requires one exact EA row for the selected warehouse/bin and untracked part. Inspect stock before continuing.');
  }
  return matching[0].QtyOnHand;
}
