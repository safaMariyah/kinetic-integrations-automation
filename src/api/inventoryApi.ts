import { BaseClient } from './baseClient';

export class InventoryApi {
  constructor(private readonly client: BaseClient) {}

  getInventoryQtyAdj(partNum: string, uomCode: string) {
    return this.client.post(
      '/Erp.BO.InventoryQtyAdjSvc/GetInventoryQtyAdj',
      {
        partnumber: partNum,
        uomCode,
      },
    );
  }

  onChangeWareHseCode(
    wareHseCode: string,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.InventoryQtyAdjSvc/OnChangeWareHseCode',
      {
        wareHseCode,
        ds,
      },
    );
  }

  onChangeBinNum(
    binNum: string,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.InventoryQtyAdjSvc/OnChangeBinNum',
      {
        binNum,
        ds,
      },
    );
  }

  onChangingAdjustQuantity(
    adjustQuantity: number,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.InventoryQtyAdjSvc/OnChangingAdjustQuantity',
      {
        adjustQuantity,
        ds,
      },
    );
  }
    preSetInventoryQtyAdj(ds: Record<string, unknown>) {
    return this.client.post(
      '/Erp.BO.InventoryQtyAdjSvc/PreSetInventoryQtyAdj',
      {
        ds,
      },
    );
  }
    setInventoryQtyAdj(ds: Record<string, unknown>) {
    return this.client.post(
      '/Erp.BO.InventoryQtyAdjSvc/SetInventoryQtyAdj',
      {
        ds,
      },
    );
  }
}