import { test, expect } from '@playwright/test';
import { verifyScopedQuickShipShipment, type QuickShipScopeEvidence } from '../../src/integrations/quickship/reader';

// Minimized observed 557 projection and EPIC06/MfgSys/PACK relationships.
// Authentication label below is synthetic; fixtures are not live integration proof.
const companyId = '5691a760-6017-421d-b544-c8ebbd1850c2';
const facilityId = '5524116a-ac56-483d-ae7d-b6f7f8f43a54';
const shipmentId = '117c06ab-2b08-4372-c62a-08df46336333';
const expected = {packNum: 332, quickShipShipmentNumber: 557, orderNum: 8146, tracking: '794912053358', companyId};
function fixture() {
  return {
    shipment: {isSuccess: true, result: {shipmentId, shipmentNumber: 557, orderNumber: '8146', trackingNumber: '794912053358',
      erpNumber: 'CS332', erpSystem: 'Epicor10', companyId: '00000000-0000-0000-0000-000000000000'}},
    company: {isSuccess: true, result: {companyId, companyName: 'EPIC06'}},
    config: {currentFacility: {facilityName: 'MfgSys', companyName: 'EPIC06', facilityId},
      currentWorkstation: {workstationKey: 'PACK', facilityId, workstationId: '1c2aabdb-e37f-4d7b-3144-08df2dcdacf2'}},
    scope: {companyName: 'EPIC06', plant: 'MfgSys', workstation: 'PACK',
      erpShipment: {ShipHead: [{Company: 'EPIC06', Plant: 'MfgSys', PackNum: 332, OrderNum: 0, MFTransNum: '557', TrackingNumber: '794912053358'}],
        ShipDtl: [{Company: 'EPIC06', PackNum: 332, OrderNum: 8146}]},
      outgoingRequest: {shipmentReference: '332', orderReference: '8146', authentication: {workstationId: 'PACK', registrationId: 'Fixture-Registration'}},
      carrierResponse: {ReturnStatus: 'SUCCESS', ShipmentNumber: '557', ReturnedContainers: [{PackID: '332', TrackingNumber: '794912053358'}]},
    },
  };
}
function verify(f: ReturnType<typeof fixture>, scope: QuickShipScopeEvidence = f.scope) {
  return verifyScopedQuickShipShipment(f.shipment, expected, scope, f.company, f.config, 'fixture-registration');
}
test('observed zero companyId requires persisted pack plus correlated artifacts and scope relationships', () => {
  expect(verify(fixture()).shipmentId).toBe(shipmentId);
  const f = fixture();
  expect(() => verify(f, {...f.scope, erpShipment: {}})).toThrow();
  expect(() => verify(f, {...f.scope, outgoingRequest: {}})).toThrow();
  expect(() => verify(f, {...f.scope, carrierResponse: {}})).toThrow();
});
test('conflicting authoritative company/facility/workstation evidence is rejected despite zero projection', () => {
  const conflicts: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => {f.company.result.companyId = 'other-company';},
    f => {f.company.result.companyName = 'OTHER';},
    f => {f.config.currentFacility.companyName = 'OTHER';},
    f => {f.config.currentFacility.facilityName = 'OTHER';},
    f => {f.config.currentWorkstation.facilityId = 'other-facility';},
    f => {f.config.currentWorkstation.workstationKey = 'OTHER';},
    f => {f.scope.erpShipment.ShipHead[0].Company = 'OTHER';},
    f => {f.scope.erpShipment.ShipHead[0].Plant = 'OTHER';},
    f => {f.scope.outgoingRequest.authentication.workstationId = 'OTHER';},
    f => {f.scope.outgoingRequest.authentication.registrationId = 'OTHER';},
  ];
  for (const conflict of conflicts) { const f = fixture(); conflict(f); expect(() => verify(f)).toThrow(); }
});
test('scope correction retains strict pack/order/shipment/tracking and carrier outcome correlation', () => {
  const conflicts: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => {f.shipment.result.erpNumber = 'CS333';},
    f => {f.shipment.result.orderNumber = '8145';},
    f => {f.shipment.result.shipmentNumber = 332;},
    f => {f.shipment.result.trackingNumber = 'OTHER';},
    f => {f.scope.erpShipment.ShipDtl[0].OrderNum = 8145;},
    f => {f.scope.outgoingRequest.shipmentReference = '333';},
    f => {f.scope.outgoingRequest.orderReference = '8145';},
    f => {f.scope.carrierResponse.ShipmentNumber = '558';},
    f => {f.scope.carrierResponse.ReturnedContainers[0].TrackingNumber = 'OTHER';},
    f => {f.scope.carrierResponse.ReturnedContainers[0].PackID = '333';},
    f => {f.scope.carrierResponse.ReturnStatus = 'FAILURE';},
    f => {f.shipment.result.companyId = 'conflicting-nonzero-company';},
  ];
  for (const conflict of conflicts) { const f = fixture(); conflict(f); expect(() => verify(f)).toThrow(); }
});

test('created Ready state requires empty tracking plus the complete ERP/artifact scope chain', () => {
 const f = fixture();
 const wanted = {...expected, tracking:''};
 const shipment = {...f.shipment, result:{...f.shipment.result, trackingNumber:'', status:'Ready'}};
 const scope: QuickShipScopeEvidence = {...f.scope,
  erpShipment:{...f.scope.erpShipment,ShipHead:[{...f.scope.erpShipment.ShipHead[0],MFTransNum:'',TrackingNumber:'',ShipStatus:'CLOSED',IsShipmentCreated:true,CreateShipment:false}]},
  outgoingRequest:{...f.scope.outgoingRequest,createShipment:true},
  carrierResponse:{returnStatus:'Warning',shipmentNumber:'557',returnMessage:'EM1243: Shipment# 557 Created Successfully'},
 };
 const check = () => verifyScopedQuickShipShipment(shipment,wanted,scope,f.company,f.config,'fixture-registration','created');
 expect(check).not.toThrow();
 expect(() => verifyScopedQuickShipShipment(shipment,wanted,scope,f.company,f.config,'fixture-registration')).toThrow();
 shipment.result.status='Shipped'; expect(check).toThrow(); shipment.result.status='Ready';
 f.config.currentWorkstation.workstationKey='OTHER'; expect(check).toThrow();
});
