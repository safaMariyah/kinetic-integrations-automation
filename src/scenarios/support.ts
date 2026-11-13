import type { APIResponse } from '@playwright/test';
import type { Dataset, Row } from './contracts';
export function record(value: unknown, context = 'object'): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected ${context}.`);
  return value as Row;
}
export function rows(ds: Dataset, table: string): Row[] {
  if (!Array.isArray(ds[table])) throw new Error(`Missing ${table} array.`);
  return (ds[table] as unknown[]).map(v => record(v, `${table} row`));
}
export function one(ds: Dataset, table: string): Row {
  const result = rows(ds, table);
  if (result.length !== 1) throw new Error(`Expected one ${table} row; received ${result.length}.`);
  return result[0];
}
export function positive(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${name}.`);
  return value;
}
export function identity(row: Row, expected: Row): void {
  for (const [key, value] of Object.entries(expected)) {
    if (row[key] !== value) throw new Error(`Business field mismatch: ${key}.`);
  }
}
export function stringsEmpty(p: Row, names: string[]): void {
  for (const name of names) {
    if (typeof p[name] !== 'string' || (p[name] as string).trim()) throw new Error(`Review business output ${name}; operation stopped.`);
  }
}
export async function json(result: Promise<{response: APIResponse; elapsedMs: number}>, operation: string, status = 200): Promise<Row> {
  let response: APIResponse;
  try { ({response} = await result); }
  catch { throw new Error(`${operation}: transport failure; inspect persisted state before retrying.`); }
  if (response.status() !== status) throw new Error(`${operation}: HTTP ${response.status()}; inspect persisted state before retrying.`);
  if (!/application\/json/i.test(response.headers()['content-type'] ?? '')) throw new Error(`${operation}: expected JSON.`);
  return record(await response.json(), `${operation} response`);
}
export function parameters(body: Row): Row { return record(body.parameters, 'parameters'); }
export function dataset(body: Row): Dataset { return record(parameters(body).ds, 'parameters.ds'); }
export function returned(body: Row): Dataset { return record(body.returnObj, 'returnObj'); }
export function changed(ds: Dataset, table: string, patch: Row, beforeImage = false): Dataset {
  const row = one(ds, table);
  const updated = {...row, ...patch, RowMod: row.RowMod === 'A' ? 'A' : 'U'};
  return {...ds, [table]: beforeImage ? [{...row, RowMod: ''}, updated] : [updated]};
}
export function assertMasterSave(body: Row): Dataset {
  const p = parameters(body);
  stringsEmpty(p, ['opReleaseMessage','opCompleteMessage','opShippingMessage','opLotMessage',
    'opInventoryMessage','opLockQtyMessage','opAllocationMessage','opPartListNeedsAttr',
    'opLotListNeedsAttr','shipCreditMsg','msg','opPostUpdMessage']);
  for (const key of ['cError','compError','checkComplianceError','changeStatusError','checkShipDtlAgain']) {
    if (p[key] !== false) throw new Error(`Shipment save requires review: ${key}. Inspect saved state; do not repeat save.`);
  }
  if (p.updateComplete !== true) throw new Error('Shipment update incomplete. Inspect saved state; do not repeat save.');
  return record(p.ds);
}
