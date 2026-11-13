import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { record, identity } from './support';
import type { Row } from './contracts';
export interface QuickShipExpected {
  packNum: number; orderNum: number; orderLine: number; partNum: string;
  quantity: number; unitPrice: number; tariff: string; packageCode: string;
  weight: number; blindShipping: boolean;
}
export function decodeArtifact(text: string): Row {
  let value: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (typeof value === 'string') value = JSON.parse(value);
  return record(value, 'integration JSON object');
}
export function verifyQuickShip(payload: unknown, expected: QuickShipExpected): void {
  const p = record(payload, 'actual QuickShip request');
  identity(p, {shipmentReference: String(expected.packNum), orderReference: String(expected.orderNum),
    blindShipping: expected.blindShipping, packageWeight: expected.weight});
  if (!Array.isArray(p.containers) || p.containers.length !== 1) throw new Error('Expected one QuickShip container.');
  const container = record(p.containers[0]);
  identity(container, {containerTypeCode: expected.packageCode, weight: expected.weight, dimensionUOM: 'IN'});
  if (!Array.isArray(container.packingDetail) || container.packingDetail.length !== 1) throw new Error('Expected one QuickShip packing detail.');
  const detail = record(container.packingDetail[0]);
  identity(detail, {qtyPacked: expected.quantity, unitPrice: expected.unitPrice, orderPrice: expected.unitPrice,
    orderlineNumber: expected.orderLine, orderReference: String(expected.orderNum)});
  identity(record(detail.product), {productKey: expected.partNum, tariff: expected.tariff, unitOfMeasure: 'EA'});
}
export async function waitForQuickShip(
  directory: string, expected: QuickShipExpected, startedAt: number, timeoutMs = 60000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  do {
    const names = await readdir(directory); // Inaccessible path fails clearly; no ERP mutation retry.
    const matches: {path: string; body: Row}[] = [];
    for (const name of names.filter(n => /^shipmentRequest.*\.json$/i.test(n))) {
      const path = join(directory, name);
      let info;
      try { info = await stat(path); } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw e;
      }
      if (!info.isFile() || info.mtimeMs < startedAt - 2000) continue;
      let p: Row;
      try { p = decodeArtifact(await readFile(path, 'utf8')); }
      catch (e) {
        if (e instanceof SyntaxError || (e as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw e;
      }
      if (p.shipmentReference === String(expected.packNum) && p.orderReference === String(expected.orderNum)) matches.push({path, body: p});
    }
    if (matches.length > 1) throw new Error('Multiple QuickShip artifacts match this run; correlation is ambiguous.');
    if (matches.length === 1) {
      verifyQuickShip(matches[0].body, expected);
      return matches[0].path;
    }
    if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new Error('No fresh QuickShip request matched this run before the deadline. Shipment is retained; do not refreight.');
}

export function verifyQuickShipResponse(payload: unknown, transaction: string, packNum: number, tracking: string): void {
  const p = typeof payload === 'string' ? decodeArtifact(payload) : record(payload);
  identity(p, {ReturnStatus: 'SUCCESS', ShipmentNumber: transaction});
  if (!Array.isArray(p.ReturnedContainers) || p.ReturnedContainers.length !== 1) throw new Error('Expected one carrier response container.');
  identity(record(p.ReturnedContainers[0]), {PackID: String(packNum), TrackingNumber: tracking});
}
export async function waitForQuickShipResponse(directory: string, transaction: string, packNum: number,
  tracking: string, startedAt: number, timeoutMs = 60000): Promise<string> {
  if (!/^[0-9]+$/.test(transaction)) throw new Error('Expected numeric freight transaction identifier.');
  const deadline = Date.now() + timeoutMs;
  do {
    const matches = (await readdir(directory)).filter(n => n.toLowerCase() === `shipmentresponse_${transaction}.json`);
    if (matches.length > 1) throw new Error('Ambiguous carrier response files.');
    if (matches.length === 1) {
      const path = join(directory, matches[0]);
      try {
        const info = await stat(path);
        if (info.isFile() && info.mtimeMs >= startedAt - 2000) {
          const p = decodeArtifact(await readFile(path, 'utf8'));
          verifyQuickShipResponse(p, transaction, packNum, tracking);
          return path;
        }
      } catch (e) {
        if (!(e instanceof SyntaxError) && (e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new Error('No fresh matching carrier response before deadline; do not repeat Freight.');
}
