import { BaseClient } from './baseClient';
import type { Dataset } from '../support/datasets';

export class CustomerApi {
  constructor(private readonly client: BaseClient) {}
  getByCustId(custID: string) {
    return this.client.post('/Erp.BO.CustomerSvc/GetByCustID', { custID, withShipTo: true });
  }
  update(ds: Dataset) {
    return this.client.post('/Erp.BO.CustomerSvc/Update', { ds });
  }
}
