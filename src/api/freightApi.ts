import { BaseClient } from './baseClient';

type Dataset = Record<string, unknown>;

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