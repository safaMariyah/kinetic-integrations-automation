import type { PreparationInput } from './shipmentTypes';
import { checkpointSteps } from '../support/workflow';
import { identity, one, positive, rows, type Dataset } from '../support/datasets';
import type { BaseClient } from '../api/baseClient';
import { MiscShipmentApi, MasterPackApi } from '../api/miscShipmentApi';
import { returned, dataset, parameters, changed, type Row } from '../support/datasets';
import { json } from '../api/response';
import { PartApi } from '../api/partApi';
import { CustomerApi } from '../api/customerApi';
import { FulfillmentApi } from '../api/fulfillmentApi';
import type { Progress } from './shipmentTypes';
import { prepareOrderForShipping } from './orderPreparation';
import { verifyMovedQueueAbsent } from './fulfillmentReaders';

export interface MiscPackIdentity {
  company: string; orderNum: number; customerNum: number; shipToNum: string;
  miscPackNum: number; masterPackNum: number; shipViaCode: string; partNum?: string;
}

export async function readAndVerifyMiscellaneousMasterPack(client: BaseClient, expected: MiscPackIdentity) {
  const misc = returned(await json(new MiscShipmentApi(client).getById(expected.miscPackNum), 'S9: read persisted miscellaneous shipment'));
  const master = returned(await json(new MasterPackApi(client).getById(expected.masterPackNum), 'S10: read persisted master pack'));
  verifyMiscellaneousMasterPack(misc, master, expected);
  return {misc, master};
}

// Separate authoritative GetByID datasets are required; save responses are insufficient.
export function verifyMiscellaneousMasterPack(misc: Dataset, master: Dataset, expected: MiscPackIdentity) {
  for (const key of ['orderNum', 'customerNum', 'miscPackNum', 'masterPackNum'] as const) {
    if (!Number.isSafeInteger(positive(expected[key], key))) throw new Error(`Invalid ${key}.`);
  }
  identity(one(misc, 'MscShpHd'), {Company: expected.company, PackNum: expected.miscPackNum,
    OrderNum: expected.orderNum, CustNum: expected.customerNum, ShipToNum: expected.shipToNum,
    ShipViaCode: expected.shipViaCode, PkgCode: 'BOX', ShipStatus: 'CLOSED'});
  identity(one(misc, 'MscShpDt'), {Company: expected.company, PackNum: expected.miscPackNum,
    PartNum: expected.partNum ?? 'M1', Quantity: 7});
  identity(one(master, 'MasterPack'), {Company: expected.company, PackNum: expected.masterPackNum,
    ShipmentType: 'Misc', IndividualPackIDs: false, PkgCode: 'BOX', ShipViaCode: expected.shipViaCode,
    CustNum: expected.customerNum, ShipToNum: expected.shipToNum});
  const details = rows(master, 'MasterPackDtl');
  if (details.length !== 1) throw new Error('S10: expected exactly one constituent pack.');
  identity(details[0], {Company: expected.company, PackNum: expected.masterPackNum,
    DtlPackNum: expected.miscPackNum, ShipmentType: 'Misc'});
}

export interface MiscMasterInput { partNum?: string; company: string; plant: string; warehouse: string; shippingWarehouse: string; shippingBin: string; employeeId: string }
export interface MiscMasterProgress extends Progress { miscPackNum?: number; masterPackNum?: number }
type Step = <T>(name: string, action: () => Promise<T>) => Promise<T>;

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${field}.`);
  return value;
}
function exactRow(ds: Dataset, table: string, matches: (r: Row) => boolean): Row {
  const found = rows(ds, table).filter(matches);
  if (found.length !== 1) throw new Error(`Expected one scoped ${table} row.`);
  return found[0];
}
export function requireMiscMasterScope(input: MiscMasterInput) {
  if (input.company !== 'EPIC06' || input.plant !== 'MfgSys' || input.warehouse !== 'CHI') {
    throw new Error('Only evidenced EPIC06/MfgSys/CHI allocation scope is implemented.');
  }
  for (const value of [input.shippingWarehouse, input.shippingBin, input.employeeId]) text(value, 'scenario prerequisite');
  if (input.shippingWarehouse === input.warehouse && input.shippingBin === '00-00-01') throw new Error('Shipping destination must differ from source bin.');
}
async function readMaster(client: BaseClient, service: string, query: Record<string, string>) {
  return returned(await json(client.get(`/Erp.BO.${service}Svc/GetByID?${new URLSearchParams(query)}`), `Read ${service} prerequisite`));
}
async function list(client: BaseClient, service: string, whereClause: string, table: string) {
  const body = await json(client.get(`/Erp.BO.${service}Svc/GetList?${new URLSearchParams({whereClause, pageSize: '100', absolutePage: '1'})}`), `Read ${service} candidates`);
  if (parameters(body).morePages !== false) throw new Error(`${service} candidate query is incomplete.`);
  return rows(returned(body), table);
}

export async function miscellaneousMasterPack(client: BaseClient, input: MiscMasterInput, step: Step, progress: MiscMasterProgress) {
  requireMiscMasterScope(input);
  const partNum = input.partNum ?? 'M1';
  if (!partNum.trim()) throw new Error('Explicit miscellaneous part identity must not be blank.');
  const part = new PartApi(client, input.company), misc = new MiscShipmentApi(client), master = new MasterPackApi(client);
  const movement = new FulfillmentApi(client);
  const run = checkpointSteps(step, progress);
  const pre = await run('S5–S10: validate all shared prerequisites before first mutation', async () => {
    const absent = await part.getPart(partNum);
    if (absent.response.status() === 200) throw new Error('Required source part M1 already exists or the supplied isolated part identity conflicts. Inspect retained evidence before recovery; no existing part is overwritten. No new records were created.');
    if (absent.response.status() !== 404) throw new Error('M1 absence could not be established. Check access and service availability before execution.');
    const customer = returned(await json(new CustomerApi(client).getByCustId('ECD'), 'S7: read ECD and ship-tos'));
    const soldTo = one(customer, 'Customer');
    identity(soldTo, {Company: input.company, CustID: 'ECD'});
    exactRow(customer, 'ShipTo', r => r.CustNum === soldTo.CustNum && r.ShipToNum === 'EDA-A');
    const recipientRows = await list(client, 'MiscShipToSearch', "Name LIKE '%Albany%'", 'MiscShipToList');
    // Current environment misspells Distribution as Distribiution. Identity remains independently resolved.
    const selected = recipientRows.filter(r => r.Company === input.company && typeof r.Name === 'string' &&
      r.Name.replace(/Distribiution/g, 'Distribution') === 'East Coast Distribution - Albany');
    if (selected.length !== 1 || selected[0].ShipToNum !== '') throw new Error('S9: expected one Albany customer recipient with blank ship-to.');
    const recipient = one(await readMaster(client, 'Customer', {custNum: String(positive(selected[0].CustNum, 'recipient customer'))}), 'Customer');
    identity(recipient, {Company: input.company, CustNum: selected[0].CustNum, Name: selected[0].Name});
    text(recipient.CustID, 'recipient CustID');
    const reasons = (await list(client, 'Reason', "Description = 'Add new part'", 'ReasonList')).filter(r =>
      r.Company === input.company && r.ReasonType === 'M' && r.ReasonCode === 'ADD' && typeof r.Description === 'string' && r.Description.toLowerCase() === 'add new part');
    if (reasons.length !== 1) throw new Error('S6: ADD must independently resolve to Add new part for quantity adjustment.');
    const carriers = (await list(client, 'ShipVia', "Description = 'FedEx Ground'", 'ShipViaList')).filter(r => r.Company === input.company && r.Description === 'FedEx Ground');
    if (carriers.length !== 1) throw new Error('Expected one FedEx Ground carrier.');
    const shipVia = text(carriers[0].ShipViaCode, 'FedEx Ground code');
    for (const [whse, bin] of [[input.warehouse, '00-00-01'], [input.shippingWarehouse, input.shippingBin]]) {
      const warehouse = one(await readMaster(client, 'Warehse', {warehouseCode: whse}), 'Warehse');
      identity(warehouse, {Company: input.company, WarehouseCode: whse, Plant: input.plant});
      const savedBin = one(await readMaster(client, 'WhseBin', {warehouseCode: whse, binNum: bin}), 'WhseBin');
      identity(savedBin, {Company: input.company, WarehouseCode: whse, BinNum: bin, InActive: false});
    }
    const employee = one(await readMaster(client, 'EmpBasic', {empID: input.employeeId}), 'EmpBasic');
    identity(employee, {Company: input.company, EmpID: input.employeeId});
    if (employee.EmpStatus !== 'A') throw new Error('Active movement employee required.');
    identity(one(await readMaster(client, 'Packing', {pkgCode: 'BOX'}), 'Packing'), {Company: input.company, PkgCode: 'BOX'});
    for (const code of ['IN', 'LB', 'EA']) identity(one(await readMaster(client, 'UOM', {uoMCode: code}), 'UOM'), {UOMCode: code});
    return {soldTo, recipient, shipVia};
  });
  const savedPart = await run('S5: create M1; save primary bin and dimension/weight attributes; independently read', async () => {
    let ds = dataset(await json(part.getNewPart({}), 'S5: initialize Part defaults'));
    ds = changed(ds, 'Part', {PartNum: partNum, PartDescription: 'M1', UOMClassID: 'Count', IUM: 'EA', PUM: 'EA', SalesUM: 'EA'});
    // Stock and selling UOM are inherited from the server, never set to dimension UOM IN.
    identity(one(ds, 'Part'), {IUM: 'EA', SalesUM: 'EA', NonStock: false, QtyBearing: true});
    for (const k of ['TrackLots', 'TrackSerialNum', 'TrackDimension', 'TrackInventoryAttributes', 'TrackInventoryByRevision']) {
      if (one(ds, 'Part')[k] === true) throw new Error(`Simple-stock scenario does not support ${k}.`);
    }
    progress.partNum = partNum;
    await json(part.update(ds), 'S5: save new M1');
    ds = returned(await json(part.getById(partNum), 'S5: independently read created part'));
    if (!rows(ds, 'PartWhse').some(r => r.WarehouseCode === input.warehouse && r.Plant === input.plant)) {
      exactRow(ds, 'PartPlant', r => r.Company === input.company && r.PartNum === partNum && r.Plant === input.plant);
      ds = dataset(await json(part.getNewWarehouse(partNum, input.plant, ds), 'S5: initialize warehouse association for new part'));
      const added = exactRow(ds, 'PartWhse', r => r.RowMod === 'A');
      ds = {...ds, PartWhse: rows(ds, 'PartWhse').map(r => r === added ? {...r, WarehouseCode: input.warehouse, PrimBinNum: '00-00-01'} : r)};
      await json(part.update(ds), 'S5: save new part warehouse association');
      ds = returned(await json(part.getById(partNum), 'S5: read new warehouse association'));
    }
    const whse = exactRow(ds, 'PartWhse', r => r.Company === input.company && r.PartNum === partNum && r.WarehouseCode === input.warehouse && r.Plant === input.plant);
    ds = {...ds, PartWhse: rows(ds, 'PartWhse').map(r => r === whse ? {...r, PrimBinNum: '00-00-01', RowMod: 'U'} : r)};
    await json(part.update(ds), 'S5: save primary bin');
    ds = returned(await json(part.getById(partNum), 'S5: read primary bin'));
    identity(exactRow(ds, 'PartWhse', r => r.WarehouseCode === input.warehouse && r.Plant === input.plant), {PrimBinNum: '00-00-01'});
    ds = changed(ds, 'Part', {PartLengthWidthHeightUM: 'IN', NetWeight: 2, NetWeightUOM: 'LB'});
    await json(part.update(ds), 'S5: save dimension and net weight');
    const saved = one(returned(await json(part.getById(partNum), 'S5: independently read attributes')), 'Part');
    identity(saved, {Company: input.company, PartNum: partNum, PartDescription: 'M1', PartLengthWidthHeightUM: 'IN', NetWeight: 2, NetWeightUOM: 'LB'});
    return saved;
  });
  if (typeof savedPart.UnitPrice !== 'number' || !Number.isFinite(savedPart.UnitPrice) || typeof savedPart.SchedBcode !== 'string') throw new Error('Expected returned price/tariff defaults.');
  const preparation: PreparationInput = {company: input.company, customerId: 'ECD', employeeId: input.employeeId,
    plant: input.plant, fromWhse: input.warehouse, fromBin: '00-00-01', toWhse: input.shippingWarehouse, toBin: input.shippingBin,
    stockQty: 10, quantity: 7,
    unitPrice: savedPart.UnitPrice, tariff: savedPart.SchedBcode,
    partExtras: {}, shipToCode: 'EDA-A', preparedPartNum: partNum};
  // Reuse picking directly; this family does not create a customer shipment.
  await prepareOrderForShipping(client, preparation, (name, action) => run(`S6–S8: ${name}`, action), progress, true);
  await run('S8: independently verify the processed material queue is absent', async () => {
    verifyMovedQueueAbsent(await json(movement.findQueue(progress.orderNum!, input.employeeId), 'Read processed order queue'), input.company, progress.queueSeq!);
  });
  const recipientNum = positive(pre.recipient.CustNum, 'recipient customer');
  let miscDs: Dataset = {};
  await run('S9: create miscellaneous pack for Albany and this order, M1 quantity 7', async () => {
    let ds = dataset(await json(misc.getNewHeader({}), 'S9: initialize miscellaneous pack'));
    ds = changed(ds, 'MscShpHd', {CustomerCustID: pre.recipient.CustID, VendorNumVendorID: '', ShipToNum: ''});
    ds = dataset(await json(misc.getAddressInfo(ds), 'S9: default selected customer address'));
    identity(one(ds, 'MscShpHd'), {CustNum: recipientNum, Name: pre.recipient.Name, ShipToNum: ''});
    ds = dataset(await json(misc.getOrderInfo(changed(ds, 'MscShpHd', {OrderNum: progress.orderNum})), 'S9: apply order defaulting'));
    identity(one(ds, 'MscShpHd'), {CustNum: recipientNum, OrderNum: progress.orderNum, ShipToNum: ''});
    // Metadata ColumnChanging_PkgCode invokes defaulting for the selected field;
    // supply that field in the dirty dataset rather than assuming GetPackaging assigns it.
    ds = dataset(await json(misc.getPackaging('BOX', changed(ds, 'MscShpHd', {PkgCode: 'BOX', ShipViaCode: pre.shipVia})), 'S9: default BOX packaging'));
    identity(one(ds, 'MscShpHd'), {PkgCode: 'BOX'});
    const saved = dataset(await json(misc.update(ds), 'S9: save miscellaneous header'));
    progress.miscPackNum = positive(one(saved, 'MscShpHd').PackNum, 'miscellaneous pack');
    ds = returned(await json(misc.getById(progress.miscPackNum), 'S9: read saved header'));
    identity(one(ds, 'MscShpHd'), {PkgCode: 'BOX', ShipViaCode: pre.shipVia});
    if (rows(ds, 'MscShpDt').length) throw new Error('Unexpected lines on new miscellaneous pack.');
    ds = dataset(await json(misc.getNewLine(progress.miscPackNum, ds), 'S9: initialize line'));
    ds = dataset(await json(misc.onChangePartNum(changed(ds, 'MscShpDt', {PartNum: partNum})), 'S9: default M1 line'));
    ds = dataset(await json(misc.onChangeQuantity(7, ds), 'S9: set quantity 7'));
    ds = changed(ds, 'MscShpDt', {Quantity: 7});
    await json(misc.update(ds), 'S9: save miscellaneous line');
    miscDs = returned(await json(misc.getById(progress.miscPackNum), 'S9: independently read pack and line'));
    identity(one(miscDs, 'MscShpHd'), {Company: input.company, PackNum: progress.miscPackNum, CustNum: recipientNum, OrderNum: progress.orderNum, ShipToNum: '', PkgCode: 'BOX', ShipViaCode: pre.shipVia});
    identity(one(miscDs, 'MscShpDt'), {PartNum: partNum, Quantity: 7, PackNum: progress.miscPackNum});
  });
  await completeMiscellaneousMasterPack(client, {company: input.company, customerNum: recipientNum, shipViaCode: pre.shipVia, partNum}, run, progress);
  return progress;
}

/** Complete a verified OPEN constituent without repeating stock or order preparation. */
export async function completeMiscellaneousMasterPack(client: BaseClient,
  expected: {company: string; customerNum: number; shipViaCode: string; partNum?: string}, run: Step, progress: MiscMasterProgress) {
  if (progress.masterPackNum) throw new Error('Master identity already retained. Inspect it before recovery; do not create another.');
  const misc = new MiscShipmentApi(client);
  const master = new MasterPackApi(client);
  const packNum = positive(progress.miscPackNum, 'retained miscellaneous pack');
  positive(progress.orderNum, 'retained order');
  let miscDs = returned(await json(misc.getById(packNum), 'Read constituent before completion'));
  identity(one(miscDs, 'MscShpHd'), {Company: expected.company, PackNum: packNum, OrderNum: progress.orderNum,
    CustNum: expected.customerNum, ShipToNum: '', PkgCode: 'BOX', ShipViaCode: expected.shipViaCode, ShipStatus: 'OPEN'});
  identity(one(miscDs, 'MscShpDt'), {PartNum: expected.partNum ?? progress.partNum ?? 'M1', Quantity: 7, PackNum: packNum});
  if ((await json(master.cartonExists(packNum), 'Check constituent assignment before completion')).returnObj !== false) {
    throw new Error('Constituent already assigned or assignment unknown. No completion mutation started.');
  }
  await run('S9→S10: approved close of this new miscellaneous pack', async () => {
    const weight = parameters(await json(misc.calculateWeight(progress.miscPackNum!), 'Calculate weight from saved part and quantity')).calculatedWeight;
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) throw new Error('Calculated weight must be positive.');
    // CalculateWeight uses the saved pack's unit context; the UI assigns only Weight.
    miscDs = changed(miscDs, 'MscShpHd', {Weight: weight});
    miscDs = dataset(await json(misc.update(miscDs), 'Save calculated weight'));
    await json(misc.close(progress.miscPackNum!, changed(miscDs, 'MscShpHd', {})), 'Close this miscellaneous pack once');
    miscDs = returned(await json(misc.getById(progress.miscPackNum!), 'Independently verify CLOSED miscellaneous pack'));
    identity(one(miscDs, 'MscShpHd'), {ShipStatus: 'CLOSED'});
  });
  await run('S10: save master pack and add the exact CLOSED miscellaneous pack', async () => {
    let ds = dataset(await json(master.getNewHeader({}), 'S10: initialize master pack'));
    ds = dataset(await json(master.getPackaging('BOX', changed(ds, 'MasterPack', {PkgCode: 'BOX', ShipmentType: 'Misc', OurBank: '', IndividualPackIDs: false, ShipViaCode: expected.shipViaCode})), 'S10: default master packaging'));
    ds = dataset(await json(master.update(ds), 'S10: save master header'));
    progress.masterPackNum = positive(one(ds, 'MasterPack').PackNum, 'master pack');
    ds = returned(await json(master.getById(progress.masterPackNum), 'S10: read saved master header'));
    if (rows(ds, 'MasterPackDtl').length) throw new Error('Unexpected existing constituent packs.');
    ds = dataset(await json(master.getNewLine(progress.masterPackNum, ds), 'S10: initialize master detail (mpackLine is parent PackNum)'));
    if ((await json(master.checkShipStatus(progress.miscPackNum!), 'S10: validate constituent status')).returnObj !== 'CLOSED') throw new Error('Constituent must be CLOSED.');
    if ((await json(master.cartonExists(progress.miscPackNum!), 'S10: reject already assigned carton')).returnObj !== false) throw new Error('Constituent already assigned or unknown assignment result.');
    ds = changed(ds, 'MasterPackDtl', {DtlPackNum: progress.miscPackNum, ShipmentType: 'Misc'});
    ds = dataset(await json(master.getShipDetails(progress.masterPackNum, progress.miscPackNum!, changed(ds, 'MasterPack', {})), 'S10: default first constituent ship details'));
    await json(master.update(ds), 'S10: save constituent');
    await readAndVerifyMiscellaneousMasterPack(client, {company: expected.company, orderNum: progress.orderNum!,
      customerNum: expected.customerNum, shipToNum: '', miscPackNum: progress.miscPackNum!, masterPackNum: progress.masterPackNum,
      shipViaCode: expected.shipViaCode, partNum: expected.partNum ?? progress.partNum ?? 'M1'});
  });
}
