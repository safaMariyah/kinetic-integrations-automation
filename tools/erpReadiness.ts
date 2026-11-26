import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createEpicorClient, type BaseClient } from '../src/api/baseClient';
import { readEpicorSettings } from '../src/config/epicor';
import { required } from '../src/config/values';
import { CustomerApi } from '../src/api/customerApi';
import { MasterDataApi } from '../src/api/masterDataApi';
import { json } from '../src/api/response';
import { identity, one, returned, rows } from '../src/support/datasets';

export interface PrerequisiteScope {
  company: string; plant: string; customerId: string; employeeId: string;
  sourceWarehouse: string; sourceBin: string; shippingWarehouse: string; shippingBin: string;
  packaging: string; shipTo?: string;
}

/** Observe current prerequisites only. A later scenario must still validate its own state. */
export async function verifyErpPrerequisites(client: BaseClient, scope: PrerequisiteScope, onCheck: (name: string) => void = () => {}): Promise<void> {
  if (scope.company !== 'EPIC06' || scope.plant !== 'MfgSys' || scope.sourceWarehouse !== 'CHI') {
    throw new Error('ERP readiness supports only the evidenced EPIC06/MfgSys/CHI capability profile.');
  }
  for (const [key, value] of Object.entries(scope)) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`ERP readiness requires ${key}; no requests were started.`);
  }
  const masters = new MasterDataApi(client);
  onCheck('customer and selected ship-to');
  const customer = returned(await json(new CustomerApi(client).getByCustId(scope.customerId), 'Readiness: read customer and ship-to prerequisites'));
  const soldTo = one(customer, 'Customer');
  identity(soldTo, {Company: scope.company, CustID: scope.customerId}, 'Readiness customer scope');
  if (scope.shipTo && rows(customer, 'ShipTo').filter(row => row.Company === scope.company && row.CustNum === soldTo.CustNum && row.ShipToNum === scope.shipTo).length !== 1) {
    throw new Error('Readiness: selected ship-to does not resolve uniquely under the configured customer. Check source prerequisites before creating records.');
  }
  for (const [warehouseCode, binNum] of [[scope.sourceWarehouse, scope.sourceBin], [scope.shippingWarehouse, scope.shippingBin]]) {
    onCheck('warehouse company/site and active bin');
    identity(one(returned(await json(masters.warehouse(warehouseCode), 'Readiness: read warehouse')), 'Warehse'),
      {Company: scope.company, Plant: scope.plant, WarehouseCode: warehouseCode}, 'Readiness warehouse scope');
    identity(one(returned(await json(masters.bin(warehouseCode, binNum), 'Readiness: read bin')), 'WhseBin'),
      {Company: scope.company, WarehouseCode: warehouseCode, BinNum: binNum, InActive: false}, 'Readiness active bin');
  }
  onCheck('active movement employee');
  identity(one(returned(await json(masters.employee(scope.employeeId), 'Readiness: read movement employee')), 'EmpBasic'),
    {Company: scope.company, EmpID: scope.employeeId, EmpStatus: 'A'}, 'Readiness active movement employee');
  onCheck('packaging');
  identity(one(returned(await json(masters.packaging(scope.packaging), 'Readiness: read packaging')), 'Packing'),
    {Company: scope.company, PkgCode: scope.packaging}, 'Readiness packaging scope');
}

export async function run(): Promise<void> {
  const settings = readEpicorSettings();
  const plant = required('POC_PLANT');
  const target = process.argv.find(value => value.startsWith('--target='))?.slice('--target='.length);
  if (target !== `${settings.baseUrl}|${settings.company}|${plant}`) {
    console.error('ERP readiness stopped before network access. Supply --target=<EPICOR_BASE_URL>|<EPICOR_COMPANY>|<POC_PLANT> matching the selected settings.');
    process.exitCode = 1;
    return;
  }
  const family = process.argv.find(value => value.startsWith('--family='))?.slice('--family='.length);
  if (!['customer', 'miscellaneous'].includes(family ?? '')) {
    console.error('Choose --family=customer or --family=miscellaneous before network access.');
    process.exitCode = 1;
    return;
  }
  const scope: PrerequisiteScope = {
    company: settings.company, plant, customerId: family === 'miscellaneous' ? 'ECD' : required('POC_CUSTOMER_ID'), employeeId: required('POC_EMPLOYEE_ID'),
    sourceWarehouse: required('POC_FROM_WHSE'), sourceBin: family === 'miscellaneous' ? '00-00-01' : required('POC_FROM_BIN'),
    shippingWarehouse: required('POC_TO_WHSE'), shippingBin: required('POC_TO_BIN'), packaging: family === 'miscellaneous' ? 'BOX' : required('POC_PACKAGE_CODE'),
    ...(family === 'miscellaneous' ? {shipTo:'EDA-A'} : {}),
  };
  const directory = join('captures', 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
  await mkdir(directory, {recursive:true});
  let session: Awaited<ReturnType<typeof createEpicorClient>> | undefined;
  let outcome = 'FAIL';
  let stage = 'authenticated ERP context';
  try {
    session = await createEpicorClient(settings);
    await verifyErpPrerequisites(session.client, scope, name => { stage = name; console.log(`Checking ERP readiness: ${name}`); });
    outcome = 'PASS';
    console.log('PASS ERP customer, selected ship-to where applicable, warehouse/site, active bins, movement employee and packaging prerequisites.');
  } catch {
    process.exitCode = 1;
    console.error(`FAIL ERP prerequisite readiness at ${stage}. Check certificate trust, authentication, selected profile and the named master data. No business writes were requested.`);
  } finally {
    try { await session?.dispose(); }
    finally {
      await writeFile(join(directory, 'erp-readiness.json'), JSON.stringify({
        at: new Date().toISOString(), outcome, family, company: scope.company, plant: scope.plant,
        kind:'current-erp-prerequisites', businessMutations:0,
        failedStage: outcome === 'FAIL' ? stage : null,
        limits:'Does not verify allocation execution, all scenario-specific prerequisites, carrier setup, QuickShip, future state or end-to-end business outcomes.',
      }, null, 2));
      console.log(`ERP readiness evidence: ${directory}`);
    }
  }
}
