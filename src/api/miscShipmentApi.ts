import type { BaseClient } from './baseClient';
import type { Dataset } from '../support/datasets';

// Documented contracts: resources/miscellaneous-master-pack/contracts.json.
// These adapters establish payload shapes, not a verified orchestration order.
export class MiscShipmentApi {
  constructor(private readonly client: BaseClient) {}
  getNewHeader(ds: Dataset) { return this.client.post('/Erp.BO.MiscShipSvc/GetNewMscShpHd', {ds}); }
  getAddressInfo(ds: Dataset) { return this.client.post('/Erp.BO.MiscShipSvc/GetAddrInfo', {ds}); }
  getOrderInfo(ds: Dataset) { return this.client.post('/Erp.BO.MiscShipSvc/GetCallInfo', {updatedField: 'Order', ds}); }
  calculateWeight(cartonNumber: number) { return this.client.post('/Erp.BO.MiscShipSvc/CalculateWeight', {cartonNumber}); }
  close(iPackNum: number, ds: Dataset) { return this.client.post('/Erp.BO.MiscShipSvc/CloseCarton', {iPackNum, ds}); }
  getPackaging(ipPkgCode: string, ds: Dataset) { return this.client.post('/Erp.BO.MiscShipSvc/GetPackaging', {ipPkgCode, ds}); }
  getNewLine(packNum: number, ds: Dataset) { return this.client.post('/Erp.BO.MiscShipSvc/GetNewMscShpDt', {packNum, ds}); }
  onChangePartNum(ds: Dataset) { return this.client.post('/Erp.BO.MiscShipSvc/OnChangePartNum', {ds}); }
  onChangeQuantity(pdQty: number, ds: Dataset) { return this.client.post('/Erp.BO.MiscShipSvc/OnChangeQuantity', {pdQty, ds}); }
  update(ds: Dataset) { return this.client.post('/Erp.BO.MiscShipSvc/Update', {ds}); }
  getById(packNum: number) { return this.client.get(`/Erp.BO.MiscShipSvc/GetByID?packNum=${packNum}`); }
}

export class MasterPackApi {
  constructor(private readonly client: BaseClient) {}
  getNewHeader(ds: Dataset) { return this.client.post('/Erp.BO.MasterPackSvc/GetNewMasterPack', {ds}); }
  getPackaging(ipPkgCode: string, ds: Dataset) { return this.client.post('/Erp.BO.MasterPackSvc/GetPackaging', {ipPkgCode, ds}); }
  getNewLine(mpackLine: number, ds: Dataset) { return this.client.post('/Erp.BO.MasterPackSvc/GetNewMasterPackDtl', {mpackLine, ds}); }
  cartonExists(packNum: number) { return this.client.post('/Erp.BO.MasterPackSvc/CartonExists', {packNum, shipmentType: 'Misc'}); }
  checkShipStatus(packNum: number) { return this.client.post('/Erp.BO.MasterPackSvc/CheckShipStatus', {packNum, shipmentType: 'Misc'}); }
  getShipDetails(PackNum: number, DtlPackNum: number, ds: Dataset) {
    return this.client.post('/Erp.BO.MasterPackSvc/GetShipDetails', {PackNum, DtlPackNum, ShipmentType: 'Misc', ds});
  }
  update(ds: Dataset) { return this.client.post('/Erp.BO.MasterPackSvc/Update', {ds}); }
  getById(packNum: number) { return this.client.get(`/Erp.BO.MasterPackSvc/GetByID?packNum=${packNum}`); }
}
