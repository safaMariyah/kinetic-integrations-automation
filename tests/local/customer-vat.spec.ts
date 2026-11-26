import { test, expect } from '@playwright/test';
import { verifyCustomerVat, requireCustomerVatComplete } from '../../src/flows/customerVat';

test('VAT mapping rejects swaps, fallback, wrong identity and wrong run', () => {
  const expected = { billingVat: 'BillingVAT', shipToVat: 'SHIPTOVAT', customerCode: '12', shipToCode: 'EDA-A', packNum: 314, orderNum: 8118 };
  const artifact = { shipmentReference: '314', orderReference: '8118', parentCustomer: { customerCode: '12', vat: 'BillingVAT' }, shipTo: { customerCode: '12', shipToCode: 'EDA-A', vat: 'SHIPTOVAT' } };
  expect(() => verifyCustomerVat(artifact, expected)).not.toThrow();
  for (const vat of ['BillingVAT', '', 'wrong']) expect(() => verifyCustomerVat({ ...artifact, shipTo: { ...artifact.shipTo, vat } }, expected)).toThrow();
  expect(() => verifyCustomerVat(artifact, { ...expected, billingVat: 'SHIPTOVAT', shipToVat: 'BillingVAT' })).toThrow();
  expect(() => verifyCustomerVat(artifact, { ...expected, shipToCode: 'other' })).toThrow();
  expect(() => verifyCustomerVat(artifact, { ...expected, packNum: 315 })).toThrow();
  expect(() => requireCustomerVatComplete()).toThrow('completeness preflight');
});

import { type APIRequestContext } from '@playwright/test';
import { BaseClient } from '../../src/api/baseClient';
import { CustomerApi } from '../../src/api/customerApi';
import { saveCustomerVat, vatChange, type VatInput } from '../../src/flows/customerVat';
import { type Dataset, type Row, rows } from '../../src/support/datasets';
const vatInput: VatInput = {company: 'EPIC06', customerId: 'ECD', shipToCode: 'EDA-A', billingVat: 'BillingVAT', shipToVat: 'SHIPTOVAT'};
function masters(): Dataset {
  return { Customer: [{Company: 'EPIC06', CustID: 'ECD', CustNum: 12, UseBlindShipping: false, CustomerVATNum: '', SysRevID: 3, RowMod: ''}],
    ShipTo: ['', 'EDA-A', 'OTHER'].map(ShipToNum => ({Company: 'EPIC06', CustNum: 12, ShipToNum, ShipToVAT: '', INVATNumber: 'preserve', SysRevID: 5, RowMod: ''})), OtherTable: [{value: 'preserve'}] };
}
test('VAT updates retain nonselected masters, revisions and all returned tables', () => {
  const original = masters();
  const edited = vatChange(original, vatInput, 'ShipTo');
  expect(rows(edited, 'ShipTo').filter(r => r.RowMod === 'U')).toEqual([{...rows(original, 'ShipTo')[1], ShipToVAT: 'SHIPTOVAT', RowMod: 'U'}]);
  expect(edited.OtherTable).toBe(original.OtherTable);
  expect(original).toEqual(masters());
  expect(() => vatChange(original, {...vatInput, shipToCode: 'MISSING'}, 'ShipTo')).toThrow('exact selected');
});
for (const mode of ['success', 'missing', 'uncertain-write', 'not-persisted']) {
  test(`VAT master transport: ${mode}; independent reads and no mutation retry`, async () => {
    let state = masters();
    if (mode === 'missing') state.ShipTo = [];
    let writes = 0; let reads = 0;
    const transport = async (url: string, options: {data: Row}) => {
      let response: unknown;
      if (url.endsWith('/GetByCustID')) { reads++; response = {returnObj: structuredClone(state)}; }
      else {
        writes++;
        if (mode === 'uncertain-write') throw new Error('uncertain');
        const ds = options.data.ds as Dataset;
        if (mode !== 'not-persisted') state = {...ds, Customer: rows(ds, 'Customer').map(r => ({...r, RowMod: '', SysRevID: Number(r.SysRevID) + 1})), ShipTo: rows(ds, 'ShipTo').map(r => ({...r, RowMod: '', SysRevID: Number(r.SysRevID) + 1}))};
        response = {parameters: {ds}};
      }
      return {status: () => 200, headers: () => ({'content-type':'application/json'}), json: async () => response};
    };
    const client = new BaseClient({post: transport} as unknown as APIRequestContext, {baseUrl:'https://example.test/api/v2/odata',company:'EPIC06',timeoutMs:90000});
    const result = saveCustomerVat(new CustomerApi(client), vatInput);
    if (mode === 'success') { await expect(result).resolves.toMatchObject({billingVat:'BillingVAT',shipToVat:'SHIPTOVAT',customerCode:'12',shipToCode:'EDA-A'}); expect(writes).toBe(2); expect(reads).toBe(3); }
    else { await expect(result).rejects.toThrow(); expect(writes).toBe(mode === 'missing' ? 0 : 1); }
  });
}
