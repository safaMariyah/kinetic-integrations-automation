import { request } from '@playwright/test';
import { record, identity, one, rows, type Row } from '../../support/datasets';
import { verifyQuickShipResponse, verifyCreateOnlyResponse } from './artifacts';

const zeroGuid = '00000000-0000-0000-0000-000000000000';
export interface QuickShipExpected {
  packNum: number; quickShipShipmentNumber: number; orderNum: number; tracking: string; companyId: string;
}
export interface QuickShipScopeEvidence {
  companyName: string; plant: string; workstation: string;
  erpShipment: unknown; outgoingRequest: unknown; carrierResponse: unknown;
}
/** Identity correlation only. Scope requires verifyScopedQuickShipShipment/read below. */
export function verifyQuickShipShipment(payload: unknown, expected: QuickShipExpected): Row {
  const body = record(payload); identity(body, {isSuccess: true});
  const r = record(body.result);
  if (typeof r.shipmentNumber !== 'number' || typeof r.orderNumber !== 'string' ||
      typeof r.shipmentId !== 'string' || !r.shipmentId || typeof r.trackingNumber !== 'string' ||
      typeof r.companyId !== 'string') throw new Error('QuickShip shipment response types differ from observed contract.');
  identity(r, {shipmentNumber: expected.quickShipShipmentNumber, orderNumber: String(expected.orderNum), trackingNumber: expected.tracking});
  return r;
}
/** Scope is an evidence chain, never inferred from a placeholder GUID or session alone.
 * See resources/customer-shipment/coverage.md, QuickShip scope correction (2026-11-19).
 */
export function verifyScopedQuickShipShipment(payload: unknown, expected: QuickShipExpected,
  scope: QuickShipScopeEvidence, companyPayload: unknown, workstationPayload: unknown, registrationCode: string, phase: 'created' | 'freighted' = 'freighted'): Row {
  if (!Number.isSafeInteger(expected.packNum) || expected.packNum <= 0 ||
      !Number.isSafeInteger(expected.orderNum) || expected.orderNum <= 0 ||
      !Number.isSafeInteger(expected.quickShipShipmentNumber) || expected.quickShipShipmentNumber <= 0 ||
      (phase === 'freighted' ? !expected.tracking : expected.tracking !== '') || !expected.companyId || expected.companyId === zeroGuid ||
      !scope?.companyName || !scope.plant || !scope.workstation || !registrationCode)
    throw new Error('Exact shipment identities and independent scope evidence required.');
  const r = verifyQuickShipShipment(payload, expected);
  const company = record(companyPayload); identity(company, {isSuccess: true});
  identity(record(company.result), {companyId: expected.companyId, companyName: scope.companyName});
  const config = record(workstationPayload);
  const facility = record(config.currentFacility), workstation = record(config.currentWorkstation);
  identity(facility, {companyName: scope.companyName, facilityName: scope.plant});
  for (const value of [facility.facilityId, workstation.workstationId]) {
    if (typeof value !== 'string' || !value || value === zeroGuid) throw new Error('Missing authoritative facility/workstation identity.');
  }
  identity(workstation, {facilityId: facility.facilityId, workstationKey: scope.workstation});

  const erp = record(scope.erpShipment), head = one(erp, 'ShipHead');
  identity(head, {Company: scope.companyName, Plant: scope.plant, PackNum: expected.packNum,
    MFTransNum: phase === 'created' ? '' : String(expected.quickShipShipmentNumber), TrackingNumber: expected.tracking});
  const lines = rows(erp, 'ShipDtl');
  if (!lines.length) throw new Error('Missing persisted pack/order relationship.');
  for (const line of lines) identity(line, {Company: scope.companyName, PackNum: expected.packNum, OrderNum: expected.orderNum});
  const outgoing = record(scope.outgoingRequest);
  identity(outgoing, {shipmentReference: String(expected.packNum), orderReference: String(expected.orderNum)});
  const authentication = record(outgoing.authentication);
  identity(authentication, {workstationId: scope.workstation});
  // Kinetic config uses quickshipdemo; the saved QuickShip registration label uses QuickShipDemo.
  // Compare only this evidenced registration label without changing any other field casing.
  if (typeof authentication.registrationId !== 'string' || authentication.registrationId.toLowerCase() !== registrationCode.toLowerCase())
    throw new Error('Conflicting outgoing registration scope.');
  if (phase === 'created') {
    identity(head, {ShipStatus:'CLOSED', IsShipmentCreated:true, CreateShipment:false});
    identity(outgoing, {createShipment:true});
    identity(r, {status:'Ready'});
    verifyCreateOnlyResponse(scope.carrierResponse, String(expected.quickShipShipmentNumber));
  } else verifyQuickShipResponse(scope.carrierResponse, String(expected.quickShipShipmentNumber), expected.packNum, expected.tracking);
  identity(r, {erpSystem: 'Epicor10', erpNumber: `CS${expected.packNum}`});
  // Zero is observed on this CS integration projection; it supplies no scope evidence.
  // Even a nonzero matching field never substitutes for the chain above.
  if (r.companyId !== zeroGuid) identity(r, {companyId: expected.companyId});
  return r;
}
export async function createQuickShipReader(baseURL: string, registrationCode: string, storageState: string) {
  if (new URL(baseURL).origin !== baseURL || !registrationCode || !storageState)
    throw new Error('Explicit approved QuickShip origin, registration and saved session required.');
  const context = await request.newContext({baseURL, storageState, ignoreHTTPSErrors: false, extraHTTPHeaders: {registrationcode: registrationCode}});
  async function get(path: string) {
    const response = await context.get(path, {maxRetries: 0, maxRedirects: 0});
    if (response.status() !== 200) throw new Error('QuickShip scope/shipment read HTTP ' + response.status());
    return record(await response.json());
  }
  return {
    dispose: () => context.dispose(),
    verifyScope: async (companyId: string, companyName: string) => {
      const body = await get('/api/company/getCompany'); identity(body, {isSuccess: true});
      identity(record(body.result), {companyId, companyName});
    },
    readCreated: async (expected: QuickShipExpected & {scope: QuickShipScopeEvidence}) => {
      if (!Number.isSafeInteger(expected.quickShipShipmentNumber) || expected.quickShipShipmentNumber <= 0 || expected.tracking !== '' || !expected.scope)
        throw new Error('Exact created-shipment identity and empty tracking required.');
      const [shipment, company, workstations] = await Promise.all([
        get('/api/shipments/' + expected.quickShipShipmentNumber), get('/api/company/getCompany'), get('/api/Workstation/getAll'),
      ]);
      return verifyScopedQuickShipShipment(shipment, expected, expected.scope, company, workstations, registrationCode, 'created');
    },
    read: async (expected: QuickShipExpected & {scope: QuickShipScopeEvidence}) => {
      if (!Number.isSafeInteger(expected.quickShipShipmentNumber) || expected.quickShipShipmentNumber <= 0 || !expected.scope)
        throw new Error('Exact shipment identity and scope evidence required before reading.');
      const [shipment, company, workstations] = await Promise.all([
        get('/api/shipments/' + expected.quickShipShipmentNumber), get('/api/company/getCompany'), get('/api/Workstation/getAll'),
      ]);
      return verifyScopedQuickShipShipment(shipment, expected, expected.scope, company, workstations, registrationCode);
    },
  };
}
