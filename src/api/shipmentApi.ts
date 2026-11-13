import { BaseClient } from './baseClient';
export interface UpdateShipmentMasterInput {
  ds: Record<string, unknown>;
  doValidateCreditHold: boolean;
  doCheckShipDtl: boolean;
  doLotValidation: boolean;
  doCheckOrderComplete: boolean;
  doPostUpdate: boolean;
  doCheckCompliance: boolean;
  ipShippedFlagChanged: boolean;
  ipPackNum: number;
  ipBTCustNum: number;
}
export class ShipmentApi {
  constructor(private readonly client: BaseClient) {}

  getNewShipHead(ds: Record<string, unknown>) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/GetNewShipHead',
      {
        ds,
      },
    );
  }

  getHeadOrderInfo(
    orderNum: number,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/GetHeadOrderInfo',
      {
        orderNum: String(orderNum),
        ds,
      },
    );
  }

  onChangeShipViaCode(
    shipViaCode: string,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/OnChangeShipViaCode',
      {
        shipViaCode,
        ds,
      },
    );
  }

  getPackaging(
    ipPkgCode: string,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/GetPackaging',
      {
        ipPkgCode,
        ds,
      },
    );
  }
    updateMaster(input: UpdateShipmentMasterInput) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/UpdateMaster',
      { ...input },
    );
  }
    getNewOrdrShipDtl(
    packNum: number,
    orderNum: number,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/GetNewOrdrShipDtl',
      {
        packNum,
        orderNum,
        ds,
      },
    );
  }
    getOrderInfo(
    orderNum: string,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/GetOrderInfo',
      {
        orderNum,
        ds,
      },
    );
  }

  afterChangedShipDtlOrderNum(
    ipSalesOrder: string,
    ipPackNum: number,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/AfterChangedShipDtlOrderNum',
      {
        ipSalesOrder,
        ipPackNum,
        ds,
      },
    );
  }
    getOrderLineInfo(
    packLine: number,
    orderLine: string,
    subsPart: string,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/GetOrderLineInfo',
      {
        packLine,
        orderLine,
        subsPart,
        ds,
      },
    );
  }

  checkPrePartInfo(
    orderNum: number,
    orderLine: string,
    partNum: string,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/CheckPrePartInfo',
      {
        partNum,
        orderNum,
        orderLine,
      },
    );
  }
    getOrderRelInfo(
    packLine: number,
    orderRelNum: string,
    allowNewShipTo: boolean,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/GetOrderRelInfo',
      {
        packLine,
        orderRelNum,
        allowNewShipTo,
        ds,
      },
    );
  }
    getWhseInfo(
    packLine: number,
    whseCode: string,
    whseField: string,
    ds: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.CustShipSvc/GetWhseInfo',
      {
        packLine,
        whseCode,
        whseField,
        ds,
      },
    );
  }
    
    getById(packNum: number) {
    if (!Number.isInteger(packNum) || packNum <= 0) {
      throw new Error('Pack number must be a positive integer.');
    }

    return this.client.get(
      '/Erp.BO.CustShipSvc/GetByID' +
      `?packNum=${packNum}`,
    );
  }
  convertToManifestUOM(packNum: number) {
  if (!Number.isInteger(packNum) || packNum <= 0) {
    throw new Error('Pack number must be a positive integer.');
  }

  return this.client.post(
    '/Erp.BO.CustShipSvc/ConvertToManifestUOM',
    { ipPackNum: packNum },
  );
}
getQtyInfo(
  packLine: number,
  displayInvQty: number,
  ourJobShipQty: number,
  ds: Record<string, unknown>,
) {
  if (!Number.isInteger(packLine) || packLine < 0) {
    throw new Error('Pack line must be a nonnegative integer (0 for a new line).');
  }

  if (
    !Number.isFinite(displayInvQty) ||
    displayInvQty < 0 ||
    !Number.isFinite(ourJobShipQty) ||
    ourJobShipQty < 0
  ) {
    throw new Error('Shipment quantities must be nonnegative numbers.');
  }

  return this.client.post(
    '/Erp.BO.CustShipSvc/GetQtyInfo',
    {
      packLine,
      displayInvQty,
      ourJobShipQty,
      ds,
    },
  );
}

closeShipment(shipHeadRowId: string) {
  if (!shipHeadRowId.trim()) {
    throw new Error('Saved shipment header SysRowID is required.');
  }

  return this.client.post(
    '/Erp.BO.CustShipSvc/ChangeStatus',
    {
      ipShipHedRowID: shipHeadRowId,
      ipStatus: 'CLOSE',
      ipResetCODCharges: false,
      ipResetInsCharges: false,
      ds: {},
    },
  );
}

  validateBinCode(warehouse: string, bin: string) {
    return this.client.post('/Erp.BO.CustShipSvc/ValidateBinCode', {ipWhse: warehouse, ipBinNum: bin});
  }
}