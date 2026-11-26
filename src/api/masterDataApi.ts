import type { BaseClient } from './baseClient';

/** Existing shipment prerequisite GetByID contracts; every operation is a read. */
export class MasterDataApi {
  constructor(private readonly client: BaseClient) {}

  private read(service: string, keys: Record<string, string>) {
    return this.client.get(`/Erp.BO.${service}Svc/GetByID?${new URLSearchParams(keys)}`);
  }

  warehouse(warehouseCode: string) { return this.read('Warehse', {warehouseCode}); }
  bin(warehouseCode: string, binNum: string) { return this.read('WhseBin', {warehouseCode, binNum}); }
  employee(empID: string) { return this.read('EmpBasic', {empID}); }
  packaging(pkgCode: string) { return this.read('Packing', {pkgCode}); }
}
