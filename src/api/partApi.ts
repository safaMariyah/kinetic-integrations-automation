// Reconstructed from the documented OData contract and supplied create-part test.
import { BaseClient } from './baseClient';
import type { CreatePartPayload } from '../flows/purchasedPart';
export class PartApi {
  constructor(private readonly client: BaseClient, private readonly company: string) {}
  createPart(payload: CreatePartPayload) { return this.client.post('/Erp.BO.PartSvc/Parts', payload); }
  getPart(partNum: string) {
    const key = (v: string) => encodeURIComponent(v.replace(/'/g, "''")).replace(/'/g, '%27');
    return this.client.get(`/Erp.BO.PartSvc/Parts('${key(this.company)}','${key(partNum)}')`);
  }
}
