import { BaseClient } from './baseClient';
export interface ChangePartNumMasterInput {
  partNum: string;
  lSubstitutePartExist: boolean;
  lIsPhantom: boolean;
  uomCode: string;
  SysRowID: string;
  rowType: string;
  salesKitView: boolean;
  removeKitComponents: boolean;
  suppressUserPrompts: boolean;
  getPartXRefInfo: boolean;
  checkPartRevisionChange: boolean;
  checkChangeKitParent: boolean;
  checkPartSaleable: boolean;
  ds: Record<string, unknown>;
}
export interface ChangeSellingQtyMasterInput {
  ipSellingQuantity: string;
  chkSellQty: boolean;
  negInvTest: boolean;
  chgSellQty: boolean;
  chgDiscPer: boolean;
  lKeepUnitPrice: boolean;
  pcAttributeSetID: string;
  pcBinNum: string;
  pcDimCode: string;
  pcLotNum: string;
  pcPartNum: string;
  pcWhseCode: string;
  pdDimConvFactor: string;
  suppressUserPrompts: boolean;
  ds: Record<string, unknown>;
}
export class SalesOrderApi {
  constructor(private readonly client: BaseClient) {}

  getNewOrderHed(ds: Record<string, unknown>) {
    return this.client.post(
      '/Erp.BO.SalesOrderSvc/GetNewOrderHed',
      {
        ds,
      },
    );
  }

  changeSoldToID(ds: Record<string, unknown>) {
    return this.client.post(
      '/Erp.BO.SalesOrderSvc/ChangeSoldToID',
      {
        ds,
      },
    );
  }

  update(ds: Record<string, unknown>) {
    return this.client.post(
      '/Erp.BO.SalesOrderSvc/Update',
      {
        ds,
      },
    );
  }
    getNewOrderDtl(
    orderNum: number,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.SalesOrderSvc/GetNewOrderDtl',
      {
        ds,
        orderNum,
      },
    );
  }
    changePartNumMaster(input: ChangePartNumMasterInput) {
    return this.client.post(
      '/Erp.BO.SalesOrderSvc/ChangePartNumMaster',
      { ...input },
    );
  }
    changeSellingQtyMaster(input: ChangeSellingQtyMasterInput) {
    return this.client.post(
      '/Erp.BO.SalesOrderSvc/ChangeSellingQtyMaster',
      { ...input },
    );
  }
}