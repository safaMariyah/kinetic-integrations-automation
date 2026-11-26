import { identity, record } from '../support/datasets';

/** Source 27: compare actual correlated artifact against independently persisted values. */
export function verifyCustomerVat(payload: unknown, persisted: {
  billingVat: string; shipToVat: string; customerCode: string; shipToCode: string;
  packNum: number; orderNum: number;
}): void {
  if (!persisted.billingVat || !persisted.shipToVat || persisted.billingVat === persisted.shipToVat)
    throw new Error('Source 11/27 require distinct nonempty persisted VAT values.');
  const p = record(payload);
  identity(p, { shipmentReference: String(persisted.packNum), orderReference: String(persisted.orderNum) });
  identity(record(p.parentCustomer), { customerCode: persisted.customerCode, vat: persisted.billingVat });
  identity(record(p.shipTo), { customerCode: persisted.customerCode, shipToCode: persisted.shipToCode, vat: persisted.shipToVat });
}


import { CustomerApi } from '../api/customerApi';
import { BaseClient } from '../api/baseClient';
import { returned, dataset, one, rows, positive, type Dataset } from '../support/datasets';
import { json } from '../api/response';

export interface VatInput { company: string; customerId: string; shipToCode: string; billingVat: string; shipToVat: string }
export function requireCustomerVatComplete(input?: VatInput): asserts input is VatInput {
  if (!input || input.company !== 'EPIC06' || input.customerId !== 'ECD' || input.shipToCode !== 'EDA-A' ||
      input.billingVat !== 'BillingVAT' || input.shipToVat !== 'SHIPTOVAT')
    throw new Error('VAT completeness preflight requires approved EPIC06 ECD / EDA-A and exact distinct source VAT values.');
}
export function selectedVatRows(ds: Dataset, input: VatInput) {
  const customer = one(ds, 'Customer');
  identity(customer, { Company: input.company, CustID: input.customerId, UseBlindShipping: false });
  const custNum = positive(customer.CustNum, 'VAT customer number');
  const selected = rows(ds, 'ShipTo').filter(r => r.Company === input.company && r.CustNum === custNum && r.ShipToNum === input.shipToCode);
  if (selected.length !== 1) throw new Error('Expected exact selected VAT ship-to.');
  if (typeof customer.CustomerVATNum !== 'string' || typeof selected[0].ShipToVAT !== 'string') throw new Error('Persisted VAT read fields differ from evidenced application contract.');
  return { customer, shipTo: selected[0], custNum };
}
export function vatChange(ds: Dataset, input: VatInput, table: 'Customer' | 'ShipTo'): Dataset {
  const {custNum} = selectedVatRows(ds, input);
  // Retain all server-returned tables, defaults, revisions and unaffected ship-to rows.
  return { ...ds, [table]: rows(ds, table).map(row => {
    const selected = table === 'Customer' || (row.Company === input.company && row.CustNum === custNum && row.ShipToNum === input.shipToCode);
    if (row.RowMod !== '' && row.RowMod !== undefined) throw new Error('Unexpected dirty master row before VAT edit.');
    return selected ? { ...row, [table === 'Customer' ? 'CustomerVATNum' : 'ShipToVAT']: table === 'Customer' ? input.billingVat : input.shipToVat, RowMod: 'U' } : { ...row };
  }) };
}
export async function readCustomerVat(api: CustomerApi, input: VatInput) {
  return returned(await json(api.getByCustId(input.customerId), 'Read persisted customer and selected ship-to'));
}
export async function saveCustomerVat(api: CustomerApi, input: VatInput, checkpoint: (stage: string) => void = () => {}) {
  requireCustomerVatComplete(input);
  let ds = await readCustomerVat(api, input);
  selectedVatRows(ds, input);
  for (const table of ['Customer', 'ShipTo'] as const) {
    checkpoint('started: Source 11 save ' + table + ' VAT');
    dataset(await json(api.update(vatChange(ds, input, table)), 'Source 11 save ' + table + ' VAT'));
    ds = await readCustomerVat(api, input);
    const selected = selectedVatRows(ds, input);
    identity(table === 'Customer' ? selected.customer : selected.shipTo,
      table === 'Customer' ? { CustomerVATNum: input.billingVat } : { ShipToVAT: input.shipToVat });
    checkpoint('completed: Source 11 independently verified ' + table + ' VAT');
  }
  const { customer, shipTo, custNum } = selectedVatRows(ds, input);
  identity(customer, { CustomerVATNum: input.billingVat });
  identity(shipTo, { ShipToVAT: input.shipToVat });
  return { billingVat: input.billingVat, shipToVat: input.shipToVat, customerCode: String(custNum), shipToCode: input.shipToCode };
}

/** Source 4/6/7: read shared integration setup; never change it implicitly. */
export async function verifyVatIntegrationSetup(client: BaseClient, workstation: string) {
  if (workstation !== 'PACK') throw new Error('VAT scenario requires the evidenced PACK workstation.');
  const company = one(returned(await json(client.get('/Erp.BO.CompanySvc/GetByID?company=EPIC06'), 'Read VAT integration company')), 'XbSyst');
  if (company.FreightSvcInt !== 'AI' || !company.QuickShipUserID || !company.QuickShipPassword ||
      String(company.QuickShipRegCode).toLowerCase() !== 'quickshipdemo') throw new Error('REST integration prerequisite differs from evidenced EPIC06 setup.');
  const apiUrl = company.QuickShipAPIURL || company.QuickShipURL;
  if (typeof apiUrl !== 'string' || new URL(apiUrl).origin !== 'http://quickshipweb') throw new Error('Unexpected configured QuickShip origin.');
  const ws = one(returned(await json(client.get('/Erp.BO.WorkStationSvc/GetByID?workStationID=PACK'), 'Read VAT workstation')), 'WorkStation');
  identity(ws, {WorkStationID: 'PACK', UseManifest: true, LogManifestMsg: true});
}
