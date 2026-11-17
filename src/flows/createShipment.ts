import { FreightApi, readFreightResult } from '../api/freightApi';
import { ShipmentApi } from '../api/customerShipmentApi';
import { json, returned, one, rows, identity, type Row, type Dataset } from '../support/datasets';

export const createShipmentGaps = [
  'Exact create-only Warning message/code and server outcome must be observed; Warning alone is insufficient.',
  'Fresh GetByID must establish CreateShipment reset and IsShipmentCreated after UpdateCreatedShipment.',
  'Checkbox save dataset/RowMod and source price/tariff/master-data applicability need validation.',
  'QuickShip server artifact provenance, create-only outcome schema and stage correlation need validation.',
];
export function requireCreateShipmentComplete(): never {
  throw new Error('Create Shipment completeness preflight blocked before mutation: '+createShipmentGaps.join(' '));
}
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
  const tracking=rows(ds,'FreightCartonResponseTracking');
  for(const row of tracking) {
    if(row.PackID!==packNum || row.TrackingNumber!=='') throw new Error('Create-only tracking/pack mismatch.');
  }
  return ds;
}
export function verifyCreatedReadBack(ds: Dataset, company: string, packNum: number): void {
  identity(one(ds,'ShipHead'),{Company:company,PackNum:packNum,ShipStatus:'CLOSED',TrackingNumber:'',IsShipmentCreated:true});
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
