import { test, expect, type APIRequestContext } from '@playwright/test';
import { BaseClient } from '../../src/api/baseClient';
import { miscellaneousMasterPack, requireMiscMasterScope, verifyMiscellaneousMasterPack } from '../../src/flows/miscellaneousMasterPack';

const expected = {company: 'TEST', orderNum: 71, customerNum: 14, shipToNum: 'EDA-A',
  miscPackNum: 35, masterPackNum: 90, shipViaCode: 'GROUND'};
function fixture() {
  return {
    misc: {MscShpHd: [{Company: 'TEST', PackNum: 35, OrderNum: 71, CustNum: 14,
      ShipToNum: 'EDA-A', ShipViaCode: 'GROUND', PkgCode: 'BOX', ShipStatus: 'CLOSED'}],
    MscShpDt: [{Company: 'TEST', PackNum: 35, PartNum: 'M1', Quantity: 7}]},
    master: {MasterPack: [{Company: 'TEST', PackNum: 90, ShipmentType: 'Misc',
      IndividualPackIDs: false, PkgCode: 'BOX', ShipViaCode: 'GROUND', CustNum: 14, ShipToNum: 'EDA-A'}],
    MasterPackDtl: [{Company: 'TEST', PackNum: 90, DtlPackNum: 35, ShipmentType: 'Misc'}]},
  };
}
test('S9–S10: correlate independent miscellaneous and master pack identities', () => {
  const {misc, master} = fixture();
  expect(() => verifyMiscellaneousMasterPack(misc, master, expected)).not.toThrow();
  master.MasterPackDtl[0].DtlPackNum = expected.masterPackNum;
  expect(() => verifyMiscellaneousMasterPack(misc, master, expected)).toThrow('DtlPackNum');
});
test('S9–S10: reject wrong order, quantity, shipment family and individual freight', () => {
  for (const corrupt of [
    (f: ReturnType<typeof fixture>) => { f.misc.MscShpHd[0].OrderNum++; },
    (f: ReturnType<typeof fixture>) => { f.misc.MscShpDt[0].Quantity = 10; },
    (f: ReturnType<typeof fixture>) => { f.master.MasterPack[0].ShipmentType = 'Sales'; },
    (f: ReturnType<typeof fixture>) => { f.master.MasterPack[0].IndividualPackIDs = true; },
    (f: ReturnType<typeof fixture>) => { f.master.MasterPackDtl.push({...f.master.MasterPackDtl[0]}); },
  ]) {
    const f = fixture(); corrupt(f);
    expect(() => verifyMiscellaneousMasterPack(f.misc, f.master, expected)).toThrow();
  }
});
test('S5–S10: unsupported allocation scope fails before a connection can be created', () => {
  let connected = false;
  expect(() => { requireMiscMasterScope({company: 'OTHER', plant: 'MfgSys', warehouse: 'CHI', shippingWarehouse: 'SHP', shippingBin: 'SHP-1', employeeId: 'EMP'}); connected = true; }).toThrow('allocation scope');
  expect(connected).toBe(false);
});

for (const existing of [true, false]) test(`S5–S10: missing prerequisite prevents mutations (M1 exists=${existing})`, async () => {
  const calls: string[] = [];
  const transport = async (url: string) => {
    const path = new URL(url).pathname;
    calls.push(path);
    let body: unknown = {};
    let status = 200;
    if (path.includes('/Parts(')) status = existing ? 200 : 404;
    else if (path.endsWith('/GetByCustID')) body = {returnObj: {Customer: [{Company: 'EPIC06', CustID: 'ECD', CustNum: 12}], ShipTo: [{CustNum: 12, ShipToNum: 'EDA-A'}]}};
    else if (path.includes('MiscShipToSearchSvc/GetList')) body = {returnObj: {MiscShipToList: []}, parameters: {morePages: false}};
    else throw new Error('Unexpected request beyond readiness');
    return {status: () => status, headers: () => ({'content-type': 'application/json'}), json: async () => body};
  };
  const client = new BaseClient({get: transport, post: transport} as unknown as APIRequestContext,
    {baseUrl: 'https://example.test/api/v2/odata', company: 'EPIC06', timeoutMs: 1000});
  await expect(miscellaneousMasterPack(client, {company: 'EPIC06', plant: 'MfgSys', warehouse: 'CHI',
    shippingWarehouse: 'SHP', shippingBin: 'SHP-1', employeeId: '105'}, async (_name, action) => action(), {stage: 'start'}))
    .rejects.toThrow(existing ? 'Required source part M1 already exists' : 'Albany customer');
  expect(calls.some(p => /GetNew|Update|Allocation|Movement|CloseCarton/.test(p))).toBe(false);
});
