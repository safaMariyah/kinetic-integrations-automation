import type { PreparedShipment, Progress } from './shipmentTypes';
import type { ShipmentFreightInput } from './shipmentFreight';
import { sanitizedFreightResponse } from '../api/freightApi';
import type { BaseClient } from '../api/baseClient';
import { FreightApi, readFreightResult } from '../api/freightApi';
import { ShipmentApi } from '../api/customerShipmentApi';
import { returned, one, rows, identity, changed, assertMasterSave, positive, type Row, type Dataset } from '../support/datasets';
import { json } from '../api/response';

export const createShipmentGaps: string[] = [];
export function requireCreateShipmentComplete(): void {
  if (createShipmentGaps.length) throw new Error('Create Shipment completeness preflight blocked before mutation: '+createShipmentGaps.join(' '));
}
export const createOnlyWarning = 'Shipment is created in QuickShip';
// Candidate discriminator mirrors inspected ProcessFreightManifest, not business success.
export function selectShipmentBranch(createShipment: boolean, body: Row): 'created' | 'freighted' {
  const result=returned(body); const status=one(result,'FreightCartonResponse');
  if(status.ErrorFlag!==false) throw new Error('Freight response error flag requires review.');
  if(createShipment && status.ErrorStatus==='Warning') return 'created';
  if(status.ErrorStatus!=='SUCCESS') throw new Error('Unsupported freight warning/status.');
  return 'freighted';
}
export function readCreatedResult(body: Row, packNum: number, evidencedWarning: string): Dataset {
  if(!evidencedWarning.trim()) throw new Error('Verified create-only warning required.');
  if(selectShipmentBranch(true,body)!=='created') throw new Error('Expected create-only branch.');
  const ds=returned(body); identity(one(ds,'FreightCartonResponse'),{ErrorMessage:evidencedWarning});
  if (!/^[1-9][0-9]*$/.test(String(one(ds,'FreightCartonResponse').TransactionNumber))) throw new Error('Create-only response requires a positive correlated transaction number.');
  const tracking=rows(ds,'FreightCartonResponseTracking');
  for(const row of tracking) {
    if(row.PackID!==packNum || row.TrackingNumber!=='') throw new Error('Create-only tracking/pack mismatch.');
  }
  return ds;
}
export function verifyCreatedReadBack(ds: Dataset, company: string, packNum: number): void {
  identity(one(ds,'ShipHead'),{Company:company,PackNum:packNum,ShipStatus:'CLOSED',TrackingNumber:'',IsShipmentCreated:true,CreateShipment:false});
}
export async function persistCreatedShipment(freight: FreightApi, ship: ShipmentApi, company: string, packNum: number) {
  // Contract has no returnObj/dataset. HTTP/JSON success alone is insufficient.
  await json(freight.updateCreatedShipment(packNum),'Persist created shipment');
  const ds=returned(await json(ship.getById(packNum),'Read created shipment independently'));
  verifyCreatedReadBack(ds,company,packNum); return ds;
}
export async function persistFreightedShipment(freight: FreightApi, ship: ShipmentApi, company: string, packNum: number, body: Row) {
  const ds=readFreightResult(body,packNum); // retains both original response tables
  await json(freight.updateFreightedShipment(packNum,ds),'Persist freighted shipment');
  const saved=returned(await json(ship.getById(packNum),'Read freighted shipment independently'));
  identity(one(saved,'ShipHead'),{Company:company,PackNum:packNum,ShipStatus:'FREIGHTED',
    TrackingNumber:one(ds,'FreightCartonResponseTracking').TrackingNumber});
  if(String(one(saved,'ShipHead').MFTransNum)!==String(one(ds,'FreightCartonResponse').TransactionNumber)) throw new Error('Persisted freight transaction mismatch.');
  return saved;
}
export type CreateShipmentVariant = 'checked-then-freight' | 'unchecked-direct';
export const createShipmentVariants = ['checked-then-freight','unchecked-direct'] as const;
export function shipmentVariantPlan(variant: CreateShipmentVariant) {
  return {variant, independentPreparation: true, sourceInputs: {stockQty:200,quantity:100,unitPrice:1,tariff:'2222.22'},
    stages: variant==='checked-then-freight' ? ['create-only','subsequent-freight'] as const : ['direct-freight'] as const};
}
// Each intended transition is claimed before sending. Uncertain sends stay claimed.
export class FreightTransitionLedger {
  private attempted = new Set<string>();
  private completed = new Set<string>();
  constructor(readonly variant: CreateShipmentVariant, readonly packNum: number) {
    if(!Number.isInteger(packNum)||packNum<=0) throw new Error('Saved pack required.');
  }
  claim(stage: 'create-only'|'subsequent-freight'|'direct-freight'): void {
    if(!shipmentVariantPlan(this.variant).stages.some(s=>s===stage))throw new Error('Stage outside variant.');
    if(this.attempted.has(stage))throw new Error('Transition already attempted; inspect state, never repeat Freight.');
    if(stage==='subsequent-freight'&&!this.completed.has('create-only'))throw new Error('Verified creation required before subsequent Freight.');
    this.attempted.add(stage);
  }
  verified(stage: string): void {if(!this.attempted.has(stage))throw new Error('Unattempted transition.');this.completed.add(stage);}
  snapshot() {return {variant:this.variant,packNum:this.packNum,attempted:[...this.attempted],completed:[...this.completed]};}
}

/** Existing header edits require the unchanged before-image and the changed row. */
export async function setCreateShipmentOption(client: BaseClient, company: string, packNum: number, enabled: boolean): Promise<Dataset> {
  const ship = new ShipmentApi(client);
  const before = returned(await json(ship.getById(packNum), 'Read OPEN pack before Create Shipment option save'));
  const header = one(before, 'ShipHead');
  identity(header, {Company: company, PackNum: packNum, ShipStatus: 'OPEN'});
  if (typeof header.SysRowID !== 'string' || !header.SysRowID || (header.RowMod !== '' && header.RowMod !== undefined)) {
    throw new Error('Create Shipment option needs one clean persisted header with its original identity. No save was started.');
  }
  if (header.CreateShipment === enabled) return before;
  const result = await json(ship.updateMaster({
    ds: changed(before, 'ShipHead', {CreateShipment: enabled}, true),
    doValidateCreditHold: false, doCheckShipDtl: false, doLotValidation: false,
    doCheckOrderComplete: false, doPostUpdate: false, doCheckCompliance: false,
    ipShippedFlagChanged: false, ipPackNum: packNum, ipBTCustNum: positive(header.BTCustNum, 'saved bill-to customer'),
  }), 'Save Create Shipment option with before-image');
  assertMasterSave(result);
  const saved = returned(await json(ship.getById(packNum), 'Independently verify Create Shipment option and unchanged pack identity'));
  identity(one(saved, 'ShipHead'), {Company: company, PackNum: packNum, SysRowID: header.SysRowID, ShipStatus: 'OPEN', CreateShipment: enabled});
  return saved;
}

/** A claimed stage is never replayed, including after an uncertain transport failure. */
export async function sendCreateShipmentStage(client: BaseClient, input: ShipmentFreightInput, prepared: PreparedShipment,
  ledger: FreightTransitionLedger, stage: 'create-only' | 'subsequent-freight' | 'direct-freight', progress: Progress): Promise<Row> {
  if (ledger.packNum !== prepared.packNum || input.company !== prepared.company || input.quantity !== prepared.quantity) throw new Error('Freight stage scope differs from prepared shipment.');
  const ship = new ShipmentApi(client), freight = new FreightApi(client);
  const current = returned(await json(ship.getById(prepared.packNum), 'Read exact pack before freight stage'));
  identity(one(current, 'ShipHead'), {Company:prepared.company, PackNum:prepared.packNum, ShipStatus:'CLOSED', CreateShipment:stage === 'create-only'});
  identity(one(current, 'ShipDtl'), {OrderNum:prepared.orderNum, OrderLine:prepared.orderLine, OrderRelNum:prepared.orderRelease, PartNum:prepared.partNum, OurInventoryShipQty:prepared.quantity});
  if (stage === 'subsequent-freight') identity(one(current, 'ShipHead'), {IsShipmentCreated:true, TrackingNumber:''});
  ledger.claim(stage);
  progress.stage = `claimed: ${stage}`;
  await json(ship.convertToManifestUOM(prepared.packNum), 'Convert manifest UOM for claimed stage');
  await json(freight.getFreightTimeout(), 'Read stage timeout');
  const built = returned(await json(freight.buildCustomerFreightRequest(prepared.packNum), 'Build exact stage freight request'));
  identity(one(built, 'PackInfo'), {Company:prepared.company, PackID:prepared.packNum, FreightCarrier:input.shipVia, PkgCode:input.packageCode, Weight:input.weight, WeightUOM:'LB'});
  identity(one(built, 'OrderLine'), {PartNum:prepared.partNum, QtyShip:prepared.quantity, UnitPrice:input.unitPrice, SchedBcode:input.tariff});
  const result = await json(freight.freightCarton(built, input.freightUrl, input.workstation, input.freightTimeout), `Freight transition ${stage}`);
  progress.freightResponse = sanitizedFreightResponse(result);
  const ds = stage === 'create-only' ? readCreatedResult(result, prepared.packNum, createOnlyWarning) : readFreightResult(result, prepared.packNum);
  progress.freightTransaction = String(one(ds, 'FreightCartonResponse').TransactionNumber);
  return result;
}
