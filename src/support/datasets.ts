export type Row = Record<string, unknown>;
export type Dataset = Record<string, unknown>;
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
const diagnosticNumbers = new Set(['PackNum', 'PackID', 'OrderNum', 'OrderLine', 'OrderRelNum', 'Quantity',
  'OrderQty', 'SellingQuantity', 'OurInventoryShipQty', 'SellingInventoryShipQty', 'QtyOnHand',
  'OurReqQty', 'Weight', 'NetWeight', 'qtyPacked', 'unitPrice', 'orderPrice']);
const diagnosticStates = new Set(['OPEN', 'CLOSED', 'FREIGHTED', 'RELEASED', 'SUCCESS', 'Warning']);
function safeFieldValue(field: string, value: unknown): string {
  if (value === undefined) return '<missing>';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value) && diagnosticNumbers.has(field)) return String(value);
  if (['ShipStatus', 'TranStatus', 'ErrorStatus'].includes(field) && typeof value === 'string' && diagnosticStates.has(value)) return value;
  if (value === '') return '<empty string>';
  return `<${Array.isArray(value) ? 'array' : typeof value} withheld>`;
}

/** Show approved business scalars only; never dump arbitrary compared payload values. */
export function identity(row: Row, expected: Row, context = 'Business verification'): void {
  for (const [key, value] of Object.entries(expected)) {
    if (row[key] !== value) throw new Error(`Business field mismatch: ${key}. ${context}; expected ${safeFieldValue(key, value)}, received ${safeFieldValue(key, row[key])}. Inspect the named step and retained identities before recovery.`);
  }
}
export function stringsEmpty(p: Row, names: string[]): void {
  for (const name of names) {
    if (typeof p[name] !== 'string' || (p[name] as string).trim()) throw new Error(`Review business output ${name}; operation stopped.`);
  }
}
// Compatibility exports for existing flows and diagnostic tools.
export { json, epicorErrorSummary } from '../api/response';
export function parameters(body: Row): Row { return record(body.parameters, 'parameters'); }
export function dataset(body: Row): Dataset { return record(parameters(body).ds, 'parameters.ds'); }
export function returned(body: Row): Dataset { return record(body.returnObj, 'returnObj'); }
export function changed(ds: Dataset, table: string, patch: Row, beforeImage = false): Dataset {
  const row = one(ds, table);
  const updated = {...row, ...patch, RowMod: row.RowMod === 'A' ? 'A' : 'U'};
  return {...ds, [table]: beforeImage ? [{...row, RowMod: ''}, updated] : [updated]};
}
export { assertMasterSave } from '../api/shipmentSave';
