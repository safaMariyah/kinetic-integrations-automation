import {request,type APIRequestContext} from '@playwright/test';
import {record,identity,type Row} from './datasets';
export function verifyQuickShipShipment(payload:unknown,expected:{packNum:number;orderNum:number;tracking:string;companyId:string}):Row {
 const body=record(payload);identity(body,{isSuccess:true});const r=record(body.result);
 if(typeof r.shipmentNumber!=='number'||typeof r.orderNumber!=='string'||typeof r.shipmentId!=='string'||!r.shipmentId||typeof r.trackingNumber!=='string'||typeof r.companyId!=='string')throw new Error('QuickShip shipment response types differ from observed contract.');
 identity(r,{shipmentNumber:expected.packNum,orderNumber:String(expected.orderNum),trackingNumber:expected.tracking,companyId:expected.companyId});return r;
}
export async function createQuickShipReader(baseURL:string,registrationCode:string,storageState:string) {
 if(new URL(baseURL).origin!==baseURL||!registrationCode||!storageState)throw new Error('Explicit approved QuickShip origin, registration and saved session required.');
 const context=await request.newContext({baseURL,storageState,ignoreHTTPSErrors:false,extraHTTPHeaders:{registrationcode:registrationCode}});
 return {dispose:()=>context.dispose(),read:async(expected:{packNum:number;orderNum:number;tracking:string;companyId:string})=>{
  if(!Number.isInteger(expected.packNum)||expected.packNum<=0||!expected.companyId)throw new Error('Exact pack/company scope required.');
  const response=await context.get('/api/shipments/'+expected.packNum,{maxRetries:0,maxRedirects:0});
  if(response.status()!==200)throw new Error('QuickShip read HTTP '+response.status());
  return verifyQuickShipShipment(await response.json(),expected);
 }};
}
