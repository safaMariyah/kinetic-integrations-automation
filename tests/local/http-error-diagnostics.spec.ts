import {test, expect, type APIResponse} from '@playwright/test';
import {epicorErrorSummary, json, identity} from '../../src/support/datasets';
import { BaseClient } from '../../src/api/baseClient';
import type { APIRequestContext } from '@playwright/test';
import { EpicorTransportError } from '../../src/api/response';

test('TLS diagnostics distinguish certificate causes without retaining transport secrets', () => {
  for (const [reason, code] of [
    ['certificate has expired', 'CERT_HAS_EXPIRED'],
    ['Hostname/IP does not match certificate', 'ERR_TLS_CERT_ALTNAME_INVALID'],
    ['self-signed certificate in certificate chain', 'SELF_SIGNED_CERT_IN_CHAIN'],
    ['self-signed certificate', 'DEPTH_ZERO_SELF_SIGNED_CERT'],
    ['unable to verify the first certificate', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
  ]) {
    const error = new EpicorTransportError('GET', new Error(`${reason}\nAuthorization: private-auth\nbody: private-body`));
    expect(error.message).toContain(code);
    expect(error.message).toContain('No write was requested');
    expect(error.message).not.toMatch(/private-auth|private-body/);
    expect(error.cause).toBeUndefined();
  }
});
// Synthetic privacy tests only; these are NOT the missing live HTTP 400 response.
test('direct reads and uncertain writes withhold transport call logs and never retry', async () => {
  let calls = 0;
  const fail = async () => { calls++; throw new Error('self-signed certificate\nX-API-Key: private-key\nauthorization: private-auth\nbody: private-body'); };
  const client = new BaseClient({get:fail, post:fail} as unknown as APIRequestContext,
    {baseUrl:'https://example.test/api',company:'EPIC06',timeoutMs:1000});
  for (const action of [() => client.get('/PartSvc/Parts'), () => client.post('/PartSvc/Update', {})]) {
    try { await action(); throw new Error('Expected transport failure'); }
    catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Certificate trust was rejected');
      expect((error as Error).cause).toBeUndefined();
      for (const value of ['private-key','private-auth','private-body']) expect(String(error)).not.toContain(value);
    }
  }
  expect(calls).toBe(2);
  await expect(json(client.post('/PartSvc/Update', {}), 'Save part')).rejects.toThrow('write outcome is uncertain');
  expect(calls).toBe(3);
});
test('business diagnostics withhold unknown values, quoted customer data and secrets', () => {
  const result = epicorErrorSummary({ErrorMessage:'Invalid revision for customer "Private Name" secretToken987 https://private.example', ErrorDetails:[{ErrorNum:42,Message:'Part not found'}], Authentication:'do-not-print', ds:{private:'do-not-print'}});
  expect(result).toContain('Invalid revision'); expect(result).toContain('Part not found'); expect(result).toContain('ErrorNum=42');
  for (const secret of ['Private','Name','secretToken987','private.example','do-not-print']) expect(result).not.toContain(secret);
});
test('HTTP failure retains sanitized business details without replaying request', async () => {
  let calls=0;
  const response={status:()=>400,headers:()=>({'content-type':'application/json'}),json:async()=>{calls++;return {ErrorMessage:'Revision is required'};}} as unknown as APIResponse;
  await expect(json(Promise.resolve({response,elapsedMs:0}),'Save order line')).rejects.toThrow('Revision is required');
  expect(calls).toBe(1);
});

test('observed shipment reload error explains identity reconciliation without arbitrary server metadata', () => {
 const summary = epicorErrorSummary({ErrorDetails:[{Program:'Erp.Services.BO.CustShip.dll',Method:'ReloadUpdatedShipHead',Message:'Record not found (ShipHead).'}]});
 expect(summary).toContain('pack key may have changed');
 expect(summary).toContain('Do not assume deletion');
 expect(epicorErrorSummary({ErrorDetails:[{Program:'PrivateProgram',Method:'PrivateMethod'}]})).not.toContain('Private');
});

test('field mismatch reports safe expected/actual values while withholding private strings and unknown numbers', () => {
 expect(() => identity({Quantity:7}, {Quantity:8}, 'Verify picked shipment')).toThrow('expected 8, received 7');
 expect(() => identity({ShipStatus:'OPEN'}, {ShipStatus:'CLOSED'})).toThrow('expected CLOSED, received OPEN');
 try { identity({CustomerVATNum:'private-value', TokenNumber:987654321}, {CustomerVATNum:'required-value'}); }
 catch (error) {
   expect(String(error)).not.toContain('private-value');
   expect(String(error)).not.toContain('required-value');
 }
 try { identity({TokenNumber:987654321}, {TokenNumber:123456789}); }
 catch (error) { expect(String(error)).not.toContain('987654321'); expect(String(error)).not.toContain('123456789'); }
});
