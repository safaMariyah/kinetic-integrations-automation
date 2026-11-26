import { test, expect, type APIRequestContext } from '@playwright/test';
import { BaseClient } from '../../src/api/baseClient';
import { verifyErpPrerequisites, type PrerequisiteScope } from '../../tools/erpReadiness';

const scope: PrerequisiteScope = {company:'EPIC06',plant:'MfgSys',customerId:'ECD',employeeId:'105',
  sourceWarehouse:'CHI',sourceBin:'00-00-01',shippingWarehouse:'SHP',shippingBin:'SHP-1',packaging:'BOX',shipTo:'EDA-A'};

function fixture(defect?: 'site' | 'bin' | 'employee' | 'ship-to') {
  const calls: string[] = [];
  const respond = async (method: string, raw: string) => {
    const url = new URL(raw), p = url.searchParams;
    calls.push(method + ' ' + url.pathname.split('/').slice(-2).join('/'));
    let ds: Record<string, unknown>;
    if (url.pathname.endsWith('/Erp.BO.CustomerSvc/GetByCustID')) ds = {
      Customer:[{Company:'EPIC06',CustID:'ECD',CustNum:12}],
      ShipTo:[{Company:'EPIC06',CustNum:defect === 'ship-to' ? 99 : 12,ShipToNum:'EDA-A'}],
    };
    else if (url.pathname.endsWith('/Erp.BO.WarehseSvc/GetByID')) ds = {Warehse:[{Company:'EPIC06',Plant:defect === 'site' ? 'OTHER' : 'MfgSys',WarehouseCode:p.get('warehouseCode')}]};
    else if (url.pathname.endsWith('/Erp.BO.WhseBinSvc/GetByID')) ds = {WhseBin:[{Company:'EPIC06',WarehouseCode:p.get('warehouseCode'),BinNum:p.get('binNum'),InActive:defect === 'bin'}]};
    else if (url.pathname.endsWith('/Erp.BO.EmpBasicSvc/GetByID')) ds = {EmpBasic:[{Company:'EPIC06',EmpID:'105',EmpStatus:defect === 'employee' ? 'I' : 'A'}]};
    else if (url.pathname.endsWith('/Erp.BO.PackingSvc/GetByID')) ds = {Packing:[{Company:'EPIC06',PkgCode:'BOX'}]};
    else throw new Error('Unexpected operation');
    return {status:()=>200,headers:()=>({'content-type':'application/json'}),json:async()=>({returnObj:ds})};
  };
  const context = {get:(url:string)=>respond('GET',url),post:(url:string)=>respond('POST',url)} as unknown as APIRequestContext;
  return {calls,client:new BaseClient(context,{baseUrl:'https://example.test/api',company:'EPIC06',timeoutMs:1000})};
}

test('readiness uses only evidenced master readers and never creates business records', async () => {
  const f = fixture();
  await verifyErpPrerequisites(f.client, scope);
  expect(f.calls).toHaveLength(7);
  expect(f.calls.filter(c=>c.startsWith('POST'))).toEqual(['POST Erp.BO.CustomerSvc/GetByCustID']);
  expect(f.calls.some(c=>/Update|Freight|New|Adjust|Movement/.test(c))).toBe(false);
});

for (const defect of ['site','bin','employee','ship-to'] as const) {
  test(`readiness rejects a conflicting ${defect} prerequisite`, async () => {
    const f = fixture(defect);
    await expect(verifyErpPrerequisites(f.client, scope)).rejects.toThrow();
    expect(f.calls.some(c=>/Update|Freight|New|Adjust|Movement/.test(c))).toBe(false);
  });
}

test('unsupported readiness profile stops before any request', async () => {
  const f = fixture();
  await expect(verifyErpPrerequisites(f.client,{...scope,plant:'OTHER'})).rejects.toThrow('capability profile');
  expect(f.calls).toEqual([]);
});
