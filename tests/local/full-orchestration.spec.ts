import { test, expect, type APIRequestContext } from '@playwright/test';
import { BaseClient } from '../../src/api/baseClient';
import { customerShipment, prepareCustomerShipment, type Progress } from '../../src/flows/customerShipment';
import type { Row, Dataset } from '../../src/support/datasets';

for (const mode of ['false', 'true', 'prepare', 'product-code']) {
  const blindShipping = mode === 'true';
  const preparation = mode === 'prepare';
  test(`mock transport: complete fresh flow, mode=${mode}`, async () => {
    let part: Row = {}, orderDs: Dataset = {}, shipment: Dataset = {}, moved = false;
    const calls: string[] = [];
    const wrap = (ds: Dataset, outputs: Row = {}) => ({parameters: {ds, ...outputs}});
    const base = {Company: 'EPIC06', Plant: 'MfgSys'};
    const allocation = () => ({...base, OrderNum: 9000, OrderLine: 1, OrderRelNum: 1,
      PartNum: part.PartNum, WarehouseCode: 'CHI', OurReqQty: 8});
    const queue = () => ({...base, MtlQueueSeq: 1800, SysRowID: 'queue-id', OrderNum: 9000,
      OrderLine: 1, OrderRelNum: 1, PartNum: part.PartNum, Quantity: 8, IUM: 'EA',
      TranType: 'STK-SHP', TranStatus: 'RELEASED', FromWhse: 'CHI', FromBinNum: '00-00-00',
      ToWhse: 'SHP', ToBinNum: 'SHP-1', SelectedByEmpID: ''});
    const noMessages = (names: string[]) => Object.fromEntries(names.map(n => [n, '']));
    const transport = async (url: string, options: {data?: Row; maxRetries?: number; maxRedirects?: number}) => {
      const path = new URL(url).pathname;
      const op = path.split('/').pop()!;
      calls.push(op);
      expect(options.maxRetries).toBe(0); expect(options.maxRedirects).toBe(0);
      const b = options.data ?? {}, ds = b.ds as Dataset;
      let response: unknown;
      let code = 200;
      if (op === 'Parts') { part = {...b}; response = part; code = 201; }
      else if (op.startsWith('Parts(')) response = part;
      else if (op === 'GetInventoryQtyAdj') response = {returnObj: {InventoryQtyAdj: [{...base, PartNum: part.PartNum, RowMod: ''}]}};
      else if (op === 'OnChangeWareHseCode') response = wrap({InventoryQtyAdj: [{...(ds.InventoryQtyAdj as Row[])[0], WareHseCode: b.wareHseCode}]});
      else if (op === 'OnChangeBinNum') response = wrap({InventoryQtyAdj: [{...(ds.InventoryQtyAdj as Row[])[0], BinNum: b.binNum, UnitOfMeasure: 'EA', OnHandQty: 0}]});
      else if (op === 'OnChangingAdjustQuantity') response = wrap({InventoryQtyAdj: [{...(ds.InventoryQtyAdj as Row[])[0], AdjustQuantity: b.adjustQuantity, NewOnHandQty: b.adjustQuantity}]});
      else if (op === 'PreSetInventoryQtyAdj') response = wrap(ds, {requiresUserInput: false});
      else if (op === 'SetInventoryQtyAdj') response = {parameters: {partTranPKs: 'stock-transaction'}};
      else if (op === 'GetFullBinSearch') response = {returnObj: {PartBinSearch: [
        {...base, PartNum: part.PartNum, WhseCode: 'CHI', BinNum: '00-00-00', IUM: 'EA', AttributeSetID: 0, LotNumber: '', PCID: '', QtyOnHand: moved ? 2 : 10},
        ...(moved ? [{...base, PartNum: part.PartNum, WhseCode: 'SHP', BinNum: 'SHP-1', IUM: 'EA', AttributeSetID: 0, LotNumber: '', PCID: '', QtyOnHand: 8}] : []),
      ]}};
      else if (op === 'GetNewOrderHed') response = wrap({OrderHed: [{...base, RowMod: 'A'}]});
      else if (op === 'ChangeSoldToID') response = wrap({OrderHed: [{...(ds.OrderHed as Row[])[0], CustNum: 12}]});
      else if (op === 'Update' && path.includes('SalesOrderSvc')) {
        orderDs = structuredClone(ds);
        if (orderDs.OrderDtl) {
          (orderDs.OrderDtl as Row[])[0] = {...(orderDs.OrderDtl as Row[])[0], OrderLine: 1, OrderQty: 8, UnitPrice: 0};
          orderDs.OrderRel = [{...base, OrderNum: 9000, OrderLine: 1, OrderRelNum: 1, WarehouseCode: 'CHI', OurReqQty: 8}];
        } else (orderDs.OrderHed as Row[])[0].OrderNum = 9000;
        response = wrap(orderDs);
      }
      else if (op === 'GetNewOrderDtl') response = wrap({...ds, OrderDtl: [{...base, OrderNum: 9000, SysRowID: 'line-id', RowMod: 'A'}]});
      else if (op === 'ChangePartNumMaster') response = wrap({...ds, OrderDtl: [{...(ds.OrderDtl as Row[])[0], PartNum: b.partNum}]}, {
        ...noMessages(['cDeleteComponentsMessage','cWarningMessage','cConfigPartMessage','cSubPartMessage','explodeBOMerrMessage','cMsgType','cMsgTypeSaleable']), questionString: 'PART'});
      else if (op === 'ChangeSellingQtyMaster') response = wrap({...ds, OrderDtl: [{...(ds.OrderDtl as Row[])[0], SellingQuantity: Number(b.ipSellingQuantity), SalesUM: 'EA'}]},
        noMessages(['pcMessage','pcNeqQtyAction','opWarningMsg','cSellingQuantityChangedMsgText']));
      else if (op === 'GetListFWB') response = {returnObj: {OrderAllocList: [allocation()]}, parameters: {morePages: false}};
      else if (op === 'MergeOrderAllocListsAndGetRows') response = {returnObj: {OrderAlloc: [allocation()]}};
      else if (op === 'GetSlimOrderAlloc') response = {returnObj: {SlimOrderAlloc: [allocation()]}, parameters: {ds}};
      else if (op === 'CheckDates') response = wrap(ds, {cMessageText: ''});
      else if (op === 'AutoAllocation') response = {parameters: {lReleased: true, cMessageText: ['1 Demand record(s) allocated.','0 Demand record(s) cross docked.','1 Demand record(s) selected for picking.','1 Demand record(s) submitted for picking.'].join('\n')}};
      else if (op === 'GetRowsCustomParams') response = {returnObj: {MtlQueue: mode==='product-code' && moved ? [] : [queue()]}, parameters: {morePages: false}};
      else if (op === 'Update' && path.includes('MaterialQueueSvc')) response = wrap({MtlQueue: [(ds.MtlQueue as Row[])[1]]});
      else if (op === 'PreGetNewIssueReturn') response = {parameters: {pcAction: '', pcMessage: '', pdQtyAvailable: 0}};
      else if (op === 'VerifyMtlQueueExists') response = {returnObj: true};
      else if (op === 'GetNewIssueReturn') response = wrap({IssueReturn: [{...base, PartNum: part.PartNum, OrderNum: 9000,
        OrderLine: 1, OrderRel: 1, MtlQueueRowId: 'queue-id', TranQty: 8, RequirementQty: 8,
        FromWarehouseCode: 'CHI', FromBinNum: '00-00-00', ToWarehouseCode: 'SHP', ToBinNum: 'SHP-1', UM: 'EA', TranType: 'STK-SHP', RowMod: 'A'}]});
      else if (op === 'PrePerformMaterialMovement') response = wrap(ds, {requiresUserInput: false});
      else if (op === 'MasterInventoryBinTests') response = wrap(ds, noMessages(['pcNeqQtyAction','pcNeqQtyMessage','pcPCBinAction','pcPCBinMessage','pcOutBinAction','pcOutBinMessage']));
      else if (op === 'LockUnLockMtlQueForEmpID') response = wrap({MtlQueue: []});
      else if (op === 'PerformMaterialMovement') { moved = true; response = {parameters: {legalNumberMessage: '', partTranPKs: 'movement-1|movement-2'}}; }
      else if (op === 'GetNewShipHead') response = wrap({ShipHead: [{...base, PackNum: 0, RowMod: 'A'}], ShipDtl: []});
      else if (op === 'GetHeadOrderInfo') response = wrap({...ds, ShipHead: [{...(ds.ShipHead as Row[])[0], OrderNum: 9000, CustomerCustID: 'ECD', BTCustNum: 12, CreditHold: false, OrderHold: false}]}, {creditMessage: ''});
      else if (op === 'OnChangeShipViaCode') response = wrap(ds);
      else if (op === 'GetPackaging') response = wrap({...ds, ShipHead: [{...(ds.ShipHead as Row[])[0], PkgCode: b.ipPkgCode}]});
      else if (op === 'UpdateMaster') {
        expect(b.ipBTCustNum).toBe(12);
        shipment = structuredClone(ds);
        (shipment.ShipHead as Row[])[0] = {...(shipment.ShipHead as Row[])[0], PackNum: 400, SysRowID: 'header-id', ShipStatus: 'OPEN', RowMod: ''};
        if ((shipment.ShipDtl as Row[]).length) {
          expect((shipment.ShipDtl as Row[])[0].SellingInventoryShipQty).toBe(0);
          (shipment.ShipDtl as Row[])[0] = {...(shipment.ShipDtl as Row[])[0], PackLine: 1, SellingInventoryShipQty: 8, RowMod: ''};
        }
        response = wrap(shipment, {...noMessages(['opReleaseMessage','opCompleteMessage','opShippingMessage','opLotMessage','opInventoryMessage','opLockQtyMessage','opAllocationMessage','opPartListNeedsAttr','opLotListNeedsAttr','shipCreditMsg','msg','opPostUpdMessage']),
          cError: false, compError: false, checkComplianceError: false, changeStatusError: false, checkShipDtlAgain: false, updateComplete: true});
      }
      else if(op==='ChangeXPartNum') response=wrap(ds);
      else if(op==='GetByID' && path.includes('SalesOrderSvc')) response={returnObj:structuredClone(orderDs)};
      else if (op === 'GetByID' && path.includes('CustShipSvc')) response = {returnObj: structuredClone(shipment)};
      else if (op === 'GetNewOrdrShipDtl') response = wrap({...ds, ShipDtl: [{...base, PackNum: 400, PackLine: 0, RowMod: 'A', SellingInventoryShipQty: 0}]});
      else if (op === 'GetOrderInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], OrderNum: 9000}]}, {creditMessage: ''});
      else if (op === 'AfterChangedShipDtlOrderNum') response = wrap(ds);
      else if (op === 'GetOrderLineInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], OrderLine: 1, PartNum: part.PartNum}]});
      else if (op === 'CheckPrePartInfo') response = {parameters: {partNum: part.PartNum, origPartNum: part.PartNum, vSubAvail: false, vMsgText: '', vMsgType: ''}};
      else if (op === 'GetOrderRelInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], OrderRelNum: 1, ...(mode==='product-code'?{XPartNum:'EP1Testing'}:{})}]});
      else if (op === 'GetWhseInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], WarehouseCode: 'SHP'}]});
      else if (op === 'ValidateBinCode') response = {};
      else if (op === 'GetQtyInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], OurInventoryShipQty: b.displayInvQty}]});
      else if (op === 'ChangeStatus') { (shipment.ShipHead as Row[])[0].ShipStatus = 'CLOSED'; response = wrap(shipment); }
      else if (op === 'ConvertToManifestUOM' || op === 'UpdateTimeOut') response = {};
      else if (op === 'BuildCustFreightRequest') response = {returnObj: {
        MasterPackInfo: [], OrderInfo: [], PackInfo: [{...base, PackID: 400, FreightCarrier: 'F92', Weight: 3, WeightUOM: 'LB', PkgCode: 'BOX', SoldToUseBlindShipping: false}],
        OrderLine: [{PartNum: part.PartNum, QtyShip: 8, QTYShipUOM: 'EA', UnitPrice: 0, SchedBcode: '1234.56.7899'}]}};
      else if (op === 'FreightCarton') response = {returnObj: {FreightCartonResponse: [{ErrorFlag: false, ErrorStatus: 'SUCCESS', TransactionNumber: '600'}], FreightCartonResponseTracking: [{PackID: 400, TrackingNumber: 'tracking-local'}]}};
      else if (op === 'UpdateFreightedShipment') {
        (shipment.ShipHead as Row[])[0] = {...(shipment.ShipHead as Row[])[0], ShipStatus: 'FREIGHTED', MFTransNum: '600', TrackingNumber: 'tracking-local'}; response = {};
      } else throw new Error(`Unexpected transport operation: ${op}`);
      return {status: () => code, headers: () => ({'content-type': 'application/json'}), json: async () => structuredClone(response)};
    };
    const context = {get: transport, post: transport} as unknown as APIRequestContext;
    const client = new BaseClient(context, {baseUrl: 'https://example.test/api/v2/odata', company: 'EPIC06', timeoutMs: 90000});
    const progress: Progress = {stage: 'start'};
    const result = await (preparation ? prepareCustomerShipment : customerShipment)(client, {company: 'EPIC06', customerId: 'ECD', employeeId: '105', plant: 'MfgSys',
      fromWhse: 'CHI', fromBin: '00-00-00', toWhse: 'SHP', toBin: 'SHP-1', stockQty: 10, quantity: 8,
      shipVia: 'F92', packageCode: 'BOX', weight: 3, unitPrice: 0, tariff: '1234.56.7899', blindShipping,
      ...(mode==='product-code'?{customerPartCode:'EP1Testing'}:{}),
      freightUrl: 'http://integration.test/service', workstation: 'PACK', freightTimeout: 60, partExtras: {}},
      async (_name, action) => action(), progress);
    if (preparation) {
      expect(result.progress).toMatchObject({packNum: 400, orderNum: 9000, stage: 'completed: OPEN pack preparation boundary'});
      expect((result.shipment.ShipHead as Row[])[0].ShipStatus).toBe('OPEN');
      for (const op of ['ChangeStatus', 'ConvertToManifestUOM', 'FreightCarton', 'BuildCustFreightRequest', 'UpdateFreightedShipment']) expect(calls).not.toContain(op);
      return;
    }
    expect(result.progress).toMatchObject({orderNum: 9000, packNum: 400, queueSeq: 1800, freightTransaction: '600'});
    expect(calls.filter(c => c === 'PerformMaterialMovement')).toHaveLength(1);
    expect(calls.filter(c => c === 'FreightCarton')).toHaveLength(1);
    expect(calls.indexOf('VerifyMtlQueueExists')).toBeLessThan(calls.indexOf('PerformMaterialMovement'));
    expect((result.shipment.ShipHead as Row[])[0]).toMatchObject({UseBlindShipping: blindShipping, ShipStatus: 'FREIGHTED'});
  });
}
