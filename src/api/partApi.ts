// Reconstructed from the documented OData contract and supplied create-part test.
import { BaseClient } from './baseClient';
/** Writable create-part contract shared by the adapter and scenario builders. */
export interface CreatePartPayload extends Record<string, unknown> {
  Company: string;
  PartNum: string;
  PartDescription: string;
  UOMClassID: string;
  IUM: string;
  PUM: string;
  SalesUM: string;
  TypeCode: 'P';
  CostMethod: 'S';
  NonStock: boolean;
  QtyBearing: boolean;
}
export class PartApi {
  constructor(private readonly client: BaseClient, private readonly company: string) {}
  getNewPart(ds: Record<string, unknown>) { return this.client.post('/Erp.BO.PartSvc/GetNewPart', {ds}); }
  getNewWarehouse(partNum: string, plant: string, ds: Record<string, unknown>) {
    return this.client.post('/Erp.BO.PartSvc/GetNewPartWhse', {partNum, plant, ds});
  }
  update(ds: Record<string, unknown>) { return this.client.post('/Erp.BO.PartSvc/Update', {ds}); }
  getById(partNum: string) { return this.client.get('/Erp.BO.PartSvc/GetByID?partNum=' + encodeURIComponent(partNum)); }
  createPart(payload: CreatePartPayload) { return this.client.post('/Erp.BO.PartSvc/Parts', payload); }
  getPart(partNum: string) {
    const key = (v: string) => encodeURIComponent(v.replace(/'/g, "''")).replace(/'/g, '%27');
    return this.client.get(`/Erp.BO.PartSvc/Parts('${key(this.company)}','${key(partNum)}')`);
  }
}
