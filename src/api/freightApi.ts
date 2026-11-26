import { BaseClient } from './baseClient';



export class FreightApi {
  constructor(private readonly client: BaseClient) {}

  buildCustomerFreightRequest(packNum: number) {
    this.validatePackNum(packNum);

    return this.client.post(
      '/Erp.BO.FreightServiceSvc/BuildCustFreightRequest',
      { packID: packNum },
    );
  }

  freightCarton(
    builtRequest: Dataset,
    freightURL: string,
    workstationId: string,
    httpTimeOut: number,
  ) {
    const tableNames = [
      'MasterPackInfo',
      'PackInfo',
      'OrderInfo',
      'OrderLine',
    ] as const;

    const rdt: Dataset = {};

    for (const name of tableNames) {
      const rows = builtRequest[name];

      if (!Array.isArray(rows)) {
        throw new Error(`Freight request is missing table ${name}.`);
      }

      rdt[name] = rows;
    }

    if (!freightURL.trim() || !workstationId.trim()) {
      throw new Error('Freight URL and workstation ID are required.');
    }

    if (!Number.isFinite(httpTimeOut) || httpTimeOut <= 0) {
      throw new Error('Freight HTTP timeout must be positive.');
    }

    return this.client.post(
      '/Erp.BO.FreightServiceSvc/FreightCarton',
      {
        freightURL,
        rdt,
        WorkStationID: workstationId,
        httpTimeOut,
      },
    );
  }

  updateCreatedShipment(packNum: number) {
    this.validatePackNum(packNum);
    return this.client.post('/Erp.BO.FreightServiceSvc/UpdateCreatedShipment', {ipPackID: packNum, ipShipmentType: 'Sales'});
  }

  updateFreightedShipment(
    packNum: number,
    freightResult: Dataset,
  ) {
    this.validatePackNum(packNum);

    return this.client.post(
      '/Erp.BO.FreightServiceSvc/UpdateFreightedShipment',
      {
        ipPackID: packNum,
        ipShipmentType: 'Sales',
        ds: freightResult,
      },
    );
  }

  private validatePackNum(packNum: number): void {
    if (!Number.isInteger(packNum) || packNum <= 0) {
      throw new Error('Pack number must be a positive integer.');
    }
  }
  getFreightTimeout() {
  return this.client.post(
    '/Erp.BO.FreightServiceSvc/UpdateTimeOut',
    {},
  );
}
}
import { parameters, returned, rows, one, identity, dataset, stringsEmpty, type Row, type Dataset } from '../support/datasets';
import { epicorErrorSummary, json } from './response';
/** Whitelisted diagnostic projection; never retain arbitrary response fields or messages. */
export function sanitizedFreightResponse(body: Row): Row {
  const root = body.returnObj;
  const result = root && typeof root === 'object' && !Array.isArray(root) ? root as Row : {};
  const safeId = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) ? v
    : typeof v === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(v) ? v : '[missing/invalid]';
  const table = (name: string, project: (row: Row) => Row) => Array.isArray(result[name])
    ? (result[name] as unknown[]).slice(0, 20).map(value => value && typeof value === 'object' && !Array.isArray(value)
      ? project(value as Row) : {malformedRow: true}) : '[missing/invalid]';
  return {FreightCartonResponse: table('FreightCartonResponse', row => ({
    ErrorFlag: typeof row.ErrorFlag === 'boolean' ? row.ErrorFlag : '[missing/invalid]',
    ErrorStatus: typeof row.ErrorStatus === 'string' && /^(SUCCESS|WARNING|Warning|ERROR|Error|FAILURE)$/.test(row.ErrorStatus)
      ? row.ErrorStatus : '[missing/unrecognized]',
    ErrorMessage: typeof row.ErrorMessage === 'string' && row.ErrorMessage.trim() === 'Unable to obtain courtesy rates.'
      ? row.ErrorMessage.trim() : epicorErrorSummary({ErrorMessage: row.ErrorMessage}),
    TransactionNumber: safeId(row.TransactionNumber),
  })), FreightCartonResponseTracking: table('FreightCartonResponseTracking', row => ({
    PackID: safeId(row.PackID), TrackingNumber: safeId(row.TrackingNumber),
  }))};
}
    export function readFreightResult(body: Row, packNum: number) {
      const result = returned(body);
      const status = one(result, 'FreightCartonResponse');
      if (status.ErrorFlag !== false || status.ErrorStatus !== 'SUCCESS') {
        const flag = typeof status.ErrorFlag === 'boolean' ? String(status.ErrorFlag) : '[missing/invalid]';
        const actual = typeof status.ErrorStatus === 'string' && /^(SUCCESS|WARNING|Warning|ERROR|Error|FAILURE)$/.test(status.ErrorStatus)
          ? status.ErrorStatus : '[missing/unrecognized]';
        const message = typeof status.ErrorMessage === 'string' && status.ErrorMessage.trim() === 'Unable to obtain courtesy rates.'
          ? 'Unable to obtain courtesy rates.' : epicorErrorSummary({ErrorMessage: status.ErrorMessage});
        throw new Error(`Freight result rejected for pack ${packNum}: expected ErrorFlag=false, ErrorStatus=SUCCESS; actual ErrorFlag=${flag}, ErrorStatus=${actual}; ${message}. Inspect persisted state before retrying.`);
      }
      if (!String(status.TransactionNumber ?? '').trim()) throw new Error('Missing freight transaction.');
      const tracking = rows(result, 'FreightCartonResponseTracking');
      if (tracking.length !== 1 || tracking[0].PackID !== packNum ||
          typeof tracking[0].TrackingNumber !== 'string' || !tracking[0].TrackingNumber.trim()) {
        throw new Error('Freight tracking does not identify this pack.');
      }
      return result; // Retain BOTH tables and their original RowMod/SysRowID values.
    }
