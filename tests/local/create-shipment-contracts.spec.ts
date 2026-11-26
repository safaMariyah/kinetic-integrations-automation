import { verifyCreateOnlyResponse, stageArtifactProjection } from '../../src/integrations/quickship/artifacts';
import { setCreateShipmentOption } from '../../src/flows/createShipment';
import {test,expect,type APIRequestContext} from '@playwright/test';
import {shipmentVariantPlan,FreightTransitionLedger,selectShipmentBranch,readCreatedResult,verifyCreatedReadBack,persistCreatedShipment,persistFreightedShipment,requireCreateShipmentComplete} from '../../src/flows/createShipment';
import {FreightApi} from '../../src/api/freightApi';
import {ShipmentApi} from '../../src/api/customerShipmentApi';
import {BaseClient} from '../../src/api/baseClient';
import {waitForQuickShip,type QuickShipExpected} from '../../src/integrations/quickship/artifacts';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const warning='fixture-only observed warning'; // artificial, not a production allowlist
const response=(status='Warning',flag=false)=>({returnObj:{FreightCartonResponse:[{ErrorStatus:status,ErrorFlag:flag,ErrorMessage:warning,TransactionNumber:'19'}],FreightCartonResponseTracking:[]}});
test('create branch is conditional; arbitrary warnings and errors cannot pass',()=>{
 expect(selectShipmentBranch(true,response())).toBe('created');
 expect(()=>selectShipmentBranch(false,response())).toThrow();
 expect(()=>selectShipmentBranch(true,response('Warning',true))).toThrow();
 expect(()=>readCreatedResult(response(),4,'')).toThrow();
 expect(()=>readCreatedResult(response(),4,'other')).toThrow();
 expect(readCreatedResult(response(),4,warning)).toBeTruthy();
 const wrong={returnObj:{...response().returnObj,FreightCartonResponseTracking:[{PackID:5,TrackingNumber:''}]}};
 expect(()=>readCreatedResult(wrong,4,warning)).toThrow();
 expect(()=>verifyCreatedReadBack({ShipHead:[{Company:'C',PackNum:4,ShipStatus:'FREIGHTED',TrackingNumber:'x',IsShipmentCreated:true}]},'C',4)).toThrow();
 expect(()=>requireCreateShipmentComplete()).not.toThrow();
});
test('created and freighted handoffs preserve identifiers and both response tables',async()=>{
 const calls:{url:string;data:unknown}[]=[];
 let saved:Record<string,unknown>={Company:'C',PackNum:4,ShipStatus:'CLOSED',TrackingNumber:'',IsShipmentCreated:true,CreateShipment:false};
 const transport=async(url:string,options?:{data?:unknown})=>{calls.push({url,data:options?.data});return {status:()=>200,headers:()=>({'content-type':'application/json'}),json:async()=>url.includes('GetByID')?{returnObj:{ShipHead:[saved]}}:{}};};
 const client=new BaseClient({get:transport,post:transport} as unknown as APIRequestContext,{baseUrl:'https://example.test',company:'C',timeoutMs:1000});
 const f=new FreightApi(client),s=new ShipmentApi(client);
 await persistCreatedShipment(f,s,'C',4);
 expect(calls[0].data).toEqual({ipPackID:4,ipShipmentType:'Sales'});
 expect(calls[1].url).toContain('packNum=4');
 const body={returnObj:{FreightCartonResponse:[{ErrorStatus:'SUCCESS',ErrorFlag:false,TransactionNumber:'19',RowMod:'U'}],FreightCartonResponseTracking:[{PackID:4,TrackingNumber:'TRACK',SysRowID:'keep'}]}};
 saved={...saved,ShipStatus:'FREIGHTED',TrackingNumber:'TRACK',MFTransNum:19};
 await persistFreightedShipment(f,s,'C',4,body);
 expect(calls[2].data).toEqual({ipPackID:4,ipShipmentType:'Sales',ds:body.returnObj});
 await expect(persistCreatedShipment(f,s,'C',4)).rejects.toThrow();
});
test('same-pack stage artifacts coexist without ambiguous latest-file selection',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'stages-'));try{
 const e:QuickShipExpected={packNum:4,orderNum:8,orderLine:1,partNum:'P',quantity:100,unitPrice:1,tariff:'2222.22',packageCode:'BOX',weight:3,blindShipping:false};
 const p={shipmentReference:'4',orderReference:'8',blindShipping:false,packageWeight:3,containers:[{containerTypeCode:'BOX',weight:3,dimensionUOM:'IN',packingDetail:[{qtyPacked:100,unitPrice:1,orderPrice:1,orderlineNumber:1,orderReference:'8',product:{productKey:'P',tariff:'2222.22',unitOfMeasure:'EA'}}]}]};
 const start=Date.now();for(const [name,flag]of [['one',true],['two',false]] as const)await writeFile(join(dir,`shipmentRequest-${name}.json`),JSON.stringify({...p,createShipment:flag}));
 expect(await waitForQuickShip(dir,{...e,createShipment:true},start,0)).toContain('one');
 expect(await waitForQuickShip(dir,{...e,createShipment:false},start,0)).toContain('two');
 await writeFile(join(dir,'shipmentRequest-duplicate.json'),JSON.stringify({...p,createShipment:true}));
 await expect(waitForQuickShip(dir,{...e,createShipment:true},start,0)).rejects.toThrow('ambiguous');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('variant plans preserve source inputs and distinguish transitions from unsafe retries',()=>{
 const a=shipmentVariantPlan('checked-then-freight'),b=shipmentVariantPlan('unchecked-direct');
 expect(a.sourceInputs).toEqual({stockQty:200,quantity:100,unitPrice:1,tariff:'2222.22'});
 expect(a.stages).toEqual(['create-only','subsequent-freight']);expect(b.stages).toEqual(['direct-freight']);
 const first=new FreightTransitionLedger('checked-then-freight',101);
 expect(()=>first.claim('subsequent-freight')).toThrow();first.claim('create-only');
 expect(()=>first.claim('create-only')).toThrow('never repeat');
 expect(()=>first.claim('subsequent-freight')).toThrow();first.verified('create-only');first.claim('subsequent-freight');
 const second=new FreightTransitionLedger('unchecked-direct',102);second.claim('direct-freight');
 expect(()=>second.claim('create-only')).toThrow();expect(()=>second.claim('direct-freight')).toThrow();
 expect(first.snapshot().packNum).not.toBe(second.snapshot().packNum);
});

test('existing Create Shipment option save retains before-image and verifies unchanged pack identity', async () => {
 let header: Record<string, unknown> = {Company:'C', PackNum:4, SysRowID:'saved-row', SysRevID:123, RowMod:'', ShipStatus:'OPEN', BTCustNum:12, CreateShipment:false};
 let writes = 0, reads = 0;
 const context = {
  get:async () => {reads++; return {status:()=>200, headers:()=>({'content-type':'application/json'}), json:async()=>({returnObj:{ShipHead:[{...header}], ShipDtl:[]}})};},
  post:async (_url: string, options: {data: {ds: {ShipHead: Record<string, unknown>[]}}}) => {
   writes++;
   expect(options.data.ds.ShipHead).toEqual([{...header}, {...header, CreateShipment:true, RowMod:'U'}]);
   header = {...options.data.ds.ShipHead[1], RowMod:''};
   const parameters: Record<string, unknown> = {ds:{ShipHead:[header]}, updateComplete:true};
   for (const key of ['opReleaseMessage','opCompleteMessage','opShippingMessage','opLotMessage','opInventoryMessage','opLockQtyMessage','opAllocationMessage','opPartListNeedsAttr','opLotListNeedsAttr','shipCreditMsg','msg','opPostUpdMessage']) parameters[key]='';
   for (const key of ['cError','compError','checkComplianceError','changeStatusError','checkShipDtlAgain']) parameters[key]=false;
   return {status:()=>200, headers:()=>({'content-type':'application/json'}), json:async()=>({parameters})};
  },
 } as unknown as APIRequestContext;
 const client = new BaseClient(context, {baseUrl:'https://example.test', company:'C', timeoutMs:1000});
 await setCreateShipmentOption(client, 'C', 4, true);
 expect(writes).toBe(1); expect(reads).toBe(2);
 await setCreateShipmentOption(client, 'C', 4, true);
 expect(writes).toBe(1);
});

test('create-only artifact requires the exact observed code, status and transaction', () => {
 const valid = {returnStatus:'Warning', shipmentNumber:'583', returnMessage:'EM1243: Shipment# 583 Created Successfully'};
 verifyCreateOnlyResponse(valid,'583');
 for (const patch of [{shipmentNumber:'584'},{returnStatus:'SUCCESS'},{returnMessage:'Other warning'}]) {
  expect(() => verifyCreateOnlyResponse({...valid,...patch},'583')).toThrow();
 }
});

test('report stage projections exclude integration authentication, addresses and arbitrary response payloads', () => {
 const request = stageArtifactProjection({shipmentReference:'4',createShipment:true,authentication:{password:'private'},address:'private'},'request');
 const response = stageArtifactProjection({returnStatus:'Warning',shipmentNumber:'19',returnMessage:'private',secret:'private'},'response');
 expect(JSON.stringify({request,response})).not.toContain('private');
 expect(request.createShipment).toBe(true); expect(response.shipmentNumber).toBe('19');
});
