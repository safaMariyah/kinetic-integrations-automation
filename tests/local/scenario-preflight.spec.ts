import { createOpenCustomerShipment } from '../../src/flows/shipmentPreparation';
import { freightCustomerShipment } from '../../src/flows/shipmentFreight';
import { prepareScenarioOrder } from '../../src/flows/salesOrderPreparation';
import { prepareScenarioPicking } from '../../src/flows/pickingPreparation';
import { BaseClient } from '../../src/api/baseClient';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { validatePreparation, requirePreparationIdentity } from '../../src/flows/scenarioPreflight';
import type { ScenarioInput } from '../../src/flows/shipmentTypes';

// These checks exercise configuration barriers, not ERP contract behavior.
const input: ScenarioInput = {
  company: 'EPIC06', customerId: 'ECD', employeeId: '105', plant: 'MfgSys',
  fromWhse: 'CHI', fromBin: '00-00-00', toWhse: 'SHP', toBin: 'SHP-1',
  stockQty: 10, quantity: 8, shipVia: 'F92', packageCode: 'BOX', weight: 3,
  unitPrice: 0, tariff: '123', blindShipping: false, freightUrl: 'http://example.test/service',
  workstation: 'PACK', freightTimeout: 60, partExtras: {},
};
test('preparation rejects insufficient or nonfinite quantities before execution', () => {
  for (const patch of [{quantity: 11}, {stockQty: NaN}, {quantity: 0}]) {
    expect(() => validatePreparation({...input, ...patch})).toThrow('stock/shipment quantities');
  }
  expect(() => validatePreparation(input)).not.toThrow();
});
test('owned mapping permits explicit blank revisions but rejects omitted semantics', () => {
  expect(() => validatePreparation({...input, createOwnedMapping: true})).toThrow('explicit customer code');
  expect(() => validatePreparation({...input, createOwnedMapping: true, customerPartCode: 'EP1Testing', customerPartRevision: '', internalPartRevision: ''})).not.toThrow();
});
test('dependent capability rejects incomplete persisted identities', () => {
  expect(() => requirePreparationIdentity({}, 'order')).toThrow('prepared part identity');
  expect(() => requirePreparationIdentity({ partNum: 'PART', orderNum: 1}, 'picking')).toThrow('orderLine');
  expect(() => requirePreparationIdentity({ partNum: 'PART', orderNum: 1, orderLine: 1, orderRelease: 1}, 'shipment')).not.toThrow();
});

test('cross-company capability handoffs fail before any API call', async () => {
  let calls = 0;
  const request = async () => { calls++; throw new Error('Network access must not start'); };
  const client = new BaseClient({get: request, post: request} as unknown as APIRequestContext,
    {baseUrl:'https://example.test', company:'EPIC06', timeoutMs:1000});
  const stock = {company:'OTHER', plant:'MfgSys', partNum:'PART', inventoryTransactions:'stock-id'};
  const step = async <T>(_name: string, action: () => Promise<T>) => action();
  await expect(prepareScenarioOrder(client, input, stock, step, {stage:'start'}, false)).rejects.toThrow('stock scope differs');
  await expect(prepareScenarioPicking(client, input, {...stock, orderNum:1, orderLine:1, orderRelease:1, quantity:8}, step, {stage:'start'})).rejects.toThrow('order scope differs');
  expect(calls).toBe(0);
});

const picked = {company:'EPIC06', plant:'MfgSys', partNum:'PART', inventoryTransactions:'stock-id',
  orderNum:1, orderLine:1, orderRelease:1, quantity:8, queueSeq:2, movementTransactions:'move-id',
  shippingWarehouse:'SHP', shippingBin:'SHP-1'};

test('shipment and freight reject mismatched handoffs before contacting ERP', async () => {
  let requests = 0;
  const request = async () => { requests++; throw new Error('Unexpected API request'); };
  const client = new BaseClient({get:request, post:request} as unknown as APIRequestContext,
    {baseUrl:'https://example.test', company:'EPIC06', timeoutMs:1000});
  const step = async <T>(_name: string, action: () => Promise<T>) => action();
  await expect(createOpenCustomerShipment(client, input, {...picked, shippingBin:'OTHER'}, step, {stage:'start'})).rejects.toThrow('shipping location');
  await expect(freightCustomerShipment(client, input, step, {stage:'start'}, {...picked, company:'OTHER', packNum:3, shipment:{}})).rejects.toThrow('prepared shipment scope');
  expect(requests).toBe(0);
});

test('freight refuses a previously closed pack before close or carrier mutation', async () => {
  let reads = 0, writes = 0;
  const client = new BaseClient({
    get:async () => { reads++; return {status:()=>200, headers:()=>({'content-type':'application/json'}),
      json:async()=>({returnObj:{ShipHead:[{Company:'EPIC06', PackNum:3, ShipStatus:'CLOSED'}]}})}; },
    post:async () => { writes++; throw new Error('Unexpected mutation'); },
  } as unknown as APIRequestContext, {baseUrl:'https://example.test', company:'EPIC06', timeoutMs:1000});
  await expect(freightCustomerShipment(client, input, async (_name, action) => action(), {stage:'start'},
    {...picked, packNum:3, shipment:{}})).rejects.toThrow('ShipStatus');
  expect(reads).toBe(1);
  expect(writes).toBe(0);
});
