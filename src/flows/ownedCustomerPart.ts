import {BaseClient} from '../api/baseClient';
import {CustomerPartXRefApi} from '../api/customerPartXRefApi';
import {dataset,json,one,identity,returned,changed} from '../support/datasets';
export async function createOwnedCustomerPart(client:BaseClient,company:string,custNum:number,partNum:string,code:string,revision:string,internalRevision:string) {
 const api=new CustomerPartXRefApi(client);
 let ds=dataset(await json(api.getNew({},custNum,partNum,code),'Initialize scenario-owned customer mapping'));
 identity(one(ds,'CustXPrt'),{Company:company,CustNum:custNum,PartNum:partNum,XPartNum:code});
 ds=changed(ds,'CustXPrt',{XRevisionNum:revision,BaseRevisionNum:internalRevision});
 ds=dataset(await json(api.update(ds),'Save scenario-owned customer mapping'));
 const row=one(ds,'CustXPrt');
 if(typeof row.SysRowID!=='string'||!row.SysRowID)throw new Error('Saved mapping identity missing; inspect retained state.');
 const saved=returned(await json(api.getById(custNum,partNum,code,row.SysRowID),'Read scenario-owned mapping independently'));
 identity(one(saved,'CustXPrt'),{Company:company,CustNum:custNum,PartNum:partNum,XPartNum:code,XRevisionNum:revision,BaseRevisionNum:internalRevision,SysRowID:row.SysRowID});
 return row.SysRowID;
}
