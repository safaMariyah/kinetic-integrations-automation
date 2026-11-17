import {verifyQuickShipShipment} from '../../src/support/quickShipReader';
import {FulfillmentApi} from '../../src/api/fulfillmentApi';
import {verifyMovedQueueAbsent} from '../../src/flows/productCodeReaders';
import {test,expect,type APIRequestContext} from '@playwright/test';
import {verifyCustomerPartReference,requireProductCodeComplete} from '../../src/flows/customerProductCode';
import {CustomerPartXRefApi} from '../../src/api/customerPartXRefApi';
import {SalesOrderApi} from '../../src/api/salesOrderApi';
import {BaseClient} from '../../src/api/baseClient';
import {verifyQuickShip} from '../../src/support/quickShip';
test('product-code prerequisite and preflight reject wrong shared mapping before mutations',()=>{
 const row={Company:'C',CustNum:12,PartNum:'EP1',XPartNum:'EP1Testing'};
 verifyCustomerPartReference({CustXPrt:[row]},'C',12,'EP1','EP1Testing');
 expect(()=>verifyCustomerPartReference({CustXPrt:[row]},'C',13,'EP1','EP1Testing')).toThrow();
 expect(()=>requireProductCodeComplete()).toThrow('before mutation');
});
test('customer part selection preserves returned dataset input and exact xref keys',async()=>{
 const calls:{url:string,data:unknown}[]=[];
 const context={post:async(url:string,o:{data:unknown})=>{calls.push({url,data:o.data});return {};}} as unknown as APIRequestContext;
 const c=new BaseClient(context,{baseUrl:'https://example.test',company:'C',timeoutMs:1000});
 const ds={OrderDtl:[{OrderNum:4,OrderLine:1,PartNum:'EP1',XPartNum:'EP1Testing',RowMod:'U',SysRevID:123}],OrderHed:[{OrderNum:4}]};
 await new SalesOrderApi(c).changeXPartNum(ds);expect(calls[0].data).toEqual({ds});
 const id='12345678-1234-1234-1234-123456789abc';await new CustomerPartXRefApi(c).getById(12,'EP1','EP1Testing',id);
 expect(calls[1].data).toEqual({custNum:12,partNum:'EP1',xpartNum:'EP1Testing',sysRowID:id});
});
test('packing detail mapping checks exact customerProductCode, not internal product key',()=>{
 const expected={packNum:4,orderNum:8,orderLine:1,partNum:'EP1',quantity:100,unitPrice:1,tariff:'2222.22',packageCode:'BOX',weight:3,blindShipping:false,customerProductCode:'EP1Testing'};
 const detail={customerProductCode:'EP1Testing',qtyPacked:100,unitPrice:1,orderPrice:1,orderlineNumber:1,orderReference:'8',product:{productKey:'EP1',tariff:'2222.22',unitOfMeasure:'EA'}};
 const p={shipmentReference:'4',orderReference:'8',blindShipping:false,packageWeight:3,containers:[{containerTypeCode:'BOX',weight:3,dimensionUOM:'IN',packingDetail:[detail]}]};
 verifyQuickShip(p,expected);expect(()=>verifyQuickShip({...p,containers:[{...p.containers[0],packingDetail:[{...detail,customerProductCode:'EP1'}]}]},expected)).toThrow('customerProductCode');
});

test('queue absence requires authoritative complete result, not stock balance',()=>{
 verifyMovedQueueAbsent({parameters:{morePages:false},returnObj:{MtlQueue:[]}},'C',7);
 expect(()=>verifyMovedQueueAbsent({parameters:{morePages:true},returnObj:{MtlQueue:[]}},'C',7)).toThrow();
 expect(()=>verifyMovedQueueAbsent({parameters:{morePages:false},returnObj:{MtlQueue:[{Company:'C',MtlQueueSeq:7}]}},'C',7)).toThrow();
});

test('queue observation stays independent of selection/ownership/state filters',async()=>{
 let sent:unknown;const c=new BaseClient({post:async(_url:string,o:{data:unknown})=>{sent=o.data;return {};}} as unknown as APIRequestContext,{baseUrl:'https://example.test',company:'C',timeoutMs:1000});
 await new FulfillmentApi(c).findQueue(99,'105');
 expect(sent).toMatchObject({whereClause:'OrderNum = 99',selectedByEmpID:'',excludeTransStatus:'',onlySelectedByEmp:false,onlyUnselected:false,fromDate:'',toDate:''});
});
import {createOwnedCustomerPart} from '../../src/flows/ownedCustomerPart';
test('owned mapping retains defaults and exact returned identity with explicit revision',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';let stored:Record<string,unknown>={Company:'C',CustNum:12,PartNum:'UNIQUE',XPartNum:'EP1Testing',XRevisionNum:'',RowMod:'A',DefaultMarker:'keep'};const calls:string[]=[];
 const ctx={post:async(url:string,o:{data:Record<string,unknown>})=>{calls.push(url);if(url.includes('/Update')){const row=((o.data.ds as Record<string,unknown>).CustXPrt as Record<string,unknown>[])[0];expect(row.DefaultMarker).toBe('keep');expect(row.XRevisionNum).toBe('REV-A');expect(row.BaseRevisionNum).toBe('');stored={...row,SysRowID:id,RowMod:''};}const body=url.includes('/GetByID')?{returnObj:{CustXPrt:[stored]}}:{parameters:{ds:{CustXPrt:[stored]}}};return {status:()=>200,headers:()=>({'content-type':'application/json'}),json:async()=>body};}} as unknown as APIRequestContext;
 const client=new BaseClient(ctx,{baseUrl:'https://example.test',company:'C',timeoutMs:1000});
 expect(await createOwnedCustomerPart(client,'C',12,'UNIQUE','EP1Testing','REV-A','')).toBe(id);
 expect(calls.map(x=>x.split('/').at(-1))).toEqual(['GetNewCustXPrt','Update','GetByID']);
});

test('QuickShip reader rejects pack collisions across order tracking and company scopes',()=>{
 const e={packNum:4,orderNum:8,tracking:'T',companyId:'facility'};
 const r={shipmentNumber:4,orderNumber:'8',trackingNumber:'T',companyId:'facility',shipmentId:'internal-id'};
 expect(verifyQuickShipShipment({isSuccess:true,result:r},e)).toEqual(r);
 for(const patch of [{orderNumber:'9'},{trackingNumber:'OTHER'},{companyId:'other'},{shipmentNumber:'4'}])expect(()=>verifyQuickShipShipment({isSuccess:true,result:{...r,...patch}},e)).toThrow();
});
