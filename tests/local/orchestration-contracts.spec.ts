import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyQuickShip, waitForQuickShip, decodeArtifact, verifyQuickShipResponse, type QuickShipExpected } from '../../src/integrations/quickship/artifacts';
import { assertMasterSave } from '../../src/support/datasets';
import { BaseClient } from '../../src/api/baseClient';
import { ShipmentApi } from '../../src/api/customerShipmentApi';
import * as fulfillment from '../../src/flows/fulfillment';
import { prepareNewShipmentQuantity } from '../../src/api/customerShipmentApi';
import { readFreightResult, sanitizedFreightResponse } from '../../src/api/freightApi';
const operations = {...fulfillment, prepareNewShipmentQuantity, readFreightResult};
test('freight evidence retains warning identities and withholds arbitrary response fields', () => {
  const body = {returnObj: {secret: 'private', FreightCartonResponse: [{ErrorFlag: false, ErrorStatus: 'Warning',
    ErrorMessage: 'Unable to obtain courtesy rates. \n ', TransactionNumber: '563', token: 'private'}],
    FreightCartonResponseTracking: [{PackID: 335, TrackingNumber: '794913919581', address: 'private'}]}};
  expect(sanitizedFreightResponse(body)).toEqual({FreightCartonResponse: [{ErrorFlag: false, ErrorStatus: 'Warning',
    ErrorMessage: 'Unable to obtain courtesy rates.', TransactionNumber: '563'}],
    FreightCartonResponseTracking: [{PackID: 335, TrackingNumber: '794913919581'}]});
  expect(() => readFreightResult(body, 335)).toThrow('ErrorStatus=Warning');
  expect(sanitizedFreightResponse({returnObj: null})).toMatchObject({FreightCartonResponse: '[missing/invalid]'});
});
// Import all orchestration modules so Playwright transpiles the complete implementation.
import { customerShipment } from '../../src/flows/customerShipment';
const expected: QuickShipExpected = {packNum: 900, orderNum: 9000, orderLine: 1,
  partNum: 'APIPOC-LOCAL', quantity: 8, unitPrice: 1, tariff: 'TEST-TARIFF',
  packageCode: 'BOX', weight: 3, blindShipping: false};
function payload(blindShipping: unknown = false) {
  return {shipmentReference: '900', orderReference: '9000', blindShipping, packageWeight: 3,
    containers: [{containerTypeCode: 'BOX', weight: 3, dimensionUOM: 'IN', packingDetail: [{qtyPacked: 8, unitPrice: 1, orderPrice: 1,
      orderlineNumber: 1, orderReference: '9000', product: {
        productKey: 'APIPOC-LOCAL', tariff: 'TEST-TARIFF', unitOfMeasure: 'EA',
      }}]}]};
}
test('QuickShip validates both boolean variants and rejects string false', () => {
  verifyQuickShip(payload(false), expected);
  verifyQuickShip(payload(true), {...expected, blindShipping: true});
  expect(() => verifyQuickShip(payload('false'), expected)).toThrow('blindShipping');
  expect(() => verifyQuickShip({...payload(), orderReference: 'wrong'}, expected)).toThrow('orderReference');
  const wrong = payload(); wrong.containers[0].packingDetail[0].qtyPacked = 100;
  expect(() => verifyQuickShip(wrong, expected)).toThrow('qtyPacked');
});
test('shipment save cannot pass with allocation warning or incomplete update', () => {
  const p: Record<string, unknown> = {ds: {}, updateComplete: true,
    cError: false, compError: false, checkComplianceError: false, changeStatusError: false, checkShipDtlAgain: false};
  for (const key of ['opReleaseMessage','opCompleteMessage','opShippingMessage','opLotMessage','opInventoryMessage',
    'opLockQtyMessage','opAllocationMessage','opPartListNeedsAttr','opLotListNeedsAttr','shipCreditMsg','msg','opPostUpdMessage']) p[key] = '';
  expect(assertMasterSave({parameters: p})).toEqual({});
  expect(() => assertMasterSave({parameters: {...p, opAllocationMessage: 'Warning'}})).toThrow('opAllocationMessage');
  expect(() => assertMasterSave({parameters: {...p, updateComplete: false}})).toThrow('incomplete');
});
test('artifact polling correlates IDs and rejects stale files and ambiguous matches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'epicor-local-'));
  try {
    const path = join(dir, 'shipmentRequest_1.json');
    await writeFile(path, JSON.stringify({...payload(), orderReference: 'unrelated'}));
    await expect(waitForQuickShip(dir, expected, Date.now(), 30)).rejects.toThrow('No fresh');
    await writeFile(path, JSON.stringify(payload()));
    const old = new Date(Date.now() - 10000); await utimes(path, old, old);
    await expect(waitForQuickShip(dir, expected, Date.now(), 30)).rejects.toThrow('No fresh');
    await writeFile(path, JSON.stringify(payload()));
    expect(await waitForQuickShip(dir, expected, Date.now(), 100)).toBe(path);
    await writeFile(join(dir, 'shipmentRequest_2.json'), JSON.stringify(payload()));
    await expect(waitForQuickShip(dir, expected, Date.now(), 100)).rejects.toThrow('ambiguous');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

function fakeClient(handler: (path: string, body: Record<string, unknown>) => unknown) {
  return {post: async (path: string, body: Record<string, unknown>) => ({elapsedMs: 1, response: {
    status: () => 200, headers: () => ({'content-type': 'application/json'}),
    json: async () => handler(path, body),
  }})} as unknown as BaseClient;
}
test('queue checks stop on prompts or a missing queue without discarding IssueReturn state', async () => {
  const c = operations;
  const ds = {IssueReturn: [{PartNum: 'APIPOC-LOCAL'}]};
  const queue = {SysRowID: 'queue-row'};
  let calls = 0;
  const good = fakeClient((path, body) => {
    calls++;
    if (path.endsWith('PreGetNewIssueReturn')) {
      expect(body).toEqual({pcMtlQueueRowID: 'queue-row'});
      return {parameters: {pcAction: '', pcMessage: '', pdQtyAvailable: 0}};
    }
    expect(body).toEqual({sysRowID: 'queue-row'});
    return {returnObj: true};
  });
  await c.beforeInitialize(good, queue);
  expect(await c.verifyQueueBeforeMovement(good, queue, ds)).toBe(ds);
  expect(calls).toBe(2);
  await expect(c.beforeInitialize(fakeClient(() => ({parameters: {pcAction: 'PROMPT', pcMessage: '', pdQtyAvailable: 8}})), queue)).rejects.toThrow('pcAction');
  await expect(c.verifyQueueBeforeMovement(fakeClient(() => ({returnObj: false})), queue, ds)).rejects.toThrow('no longer exists');
});
test('new-line quantity preserves zero selling quantity until save and accepts line 0', async () => {
  const c = operations;
  const fake = fakeClient((path, body) => {
    expect(path).toContain('GetQtyInfo'); expect(body.packLine).toBe(0); expect(body.displayInvQty).toBe(8);
    return {parameters: {ds: {ShipDtl: [{PackLine: 0, OurInventoryShipQty: 8, SellingInventoryShipQty: 0, RowMod: 'A'}]}}};
  });
  const ds = await c.prepareNewShipmentQuantity(fake, {ShipDtl: [{PackLine: 0}]}, 8);
  expect(ds).toMatchObject({ShipDtl: [{OurInventoryShipQty: 8, SellingInventoryShipQty: 0}]});
  expect(() => new ShipmentApi(fake).getQtyInfo(-1, 8, 0, {})).toThrow('nonnegative');
});
test('freight handoff rejects errors and mismatched packs, retaining both returned tables', () => {
  const read = operations.readFreightResult;
  const ds = {FreightCartonResponse: [{ErrorFlag: false, ErrorStatus: 'SUCCESS', TransactionNumber: '552'}],
    FreightCartonResponseTracking: [{PackID: 324, TrackingNumber: 'track'}]};
  expect(read({returnObj: ds}, 324)).toBe(ds);
  expect(() => read({returnObj: ds}, 325)).toThrow('this pack');
  expect(() => read({returnObj: {...ds, FreightCartonResponse: [{ErrorFlag: true, ErrorStatus: 'ERROR'}]}}, 324)).toThrow('ErrorFlag');
  const warning = {...ds, FreightCartonResponse: [{ErrorFlag: false, ErrorStatus: 'WARNING', ErrorMessage: 'Unable to obtain courtesy rates. \n ', TransactionNumber: '552'}]};
  expect(() => read({returnObj: warning}, 324)).toThrow('expected ErrorFlag=false, ErrorStatus=SUCCESS; actual ErrorFlag=false, ErrorStatus=WARNING; Unable to obtain courtesy rates.');
  expect(() => read({returnObj: {...warning, FreightCartonResponse: [{...warning.FreightCartonResponse[0], ErrorMessage: 'CustomerPrivateName secret@example.com'}]}}, 324)).toThrow('[withheld]');
});
test('carrier response decodes nested JSON and verifies transaction, pack and tracking', () => {
  const response = {ReturnStatus: 'SUCCESS', ShipmentNumber: '552', ReturnedContainers: [{PackID: '324', TrackingNumber: 'track'}]};
  const decoded = decodeArtifact(JSON.stringify(JSON.stringify(response)));
  verifyQuickShipResponse(decoded, '552', 324, 'track');
  expect(() => verifyQuickShipResponse(decoded, '551', 324, 'track')).toThrow('ShipmentNumber');
  expect(() => verifyQuickShipResponse(decoded, '552', 324, 'other')).toThrow('TrackingNumber');
  expect(() => verifyQuickShipResponse({...decoded, ReturnStatus: 'ERROR'}, '552', 324, 'track')).toThrow('ReturnStatus');
});
