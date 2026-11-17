import {BaseClient} from './baseClient';
export class CustomerPartXRefApi {
  constructor(private readonly client: BaseClient) {}
  getNew(ds: Record<string,unknown>,custNum:number,partNum:string,xpartNum:string) {
    return this.client.post('/Erp.BO.CustomerPartXRefSvc/GetNewCustXPrt',{ds,custNum,partNum,xpartNum});
  }
  update(ds: Record<string,unknown>) {
    return this.client.post('/Erp.BO.CustomerPartXRefSvc/Update',{ds});
  }
  getById(custNum:number,partNum:string,xpartNum:string,sysRowID:string) {
    if(!Number.isInteger(custNum)||custNum<=0||!partNum||!xpartNum||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sysRowID))throw new Error('Exact cross-reference keys required.');
    return this.client.post('/Erp.BO.CustomerPartXRefSvc/GetByID',{custNum,partNum,xpartNum,sysRowID});
  }
}
