import { test, expect, type APIRequestContext } from '@playwright/test';
import { BaseClient } from '../../src/api/baseClient';
import { customerShipment, prepareCustomerShipment, preparePickedOrder, type Progress } from '../../src/flows/customerShipment';
import { miscellaneousMasterPack, type MiscMasterProgress } from '../../src/flows/miscellaneousMasterPack';
import type { Row, Dataset } from '../../src/support/datasets';

for (const mode of ['false', 'true', 'prepare', 'picked-order', 'misc-master', 'product-code', 'vat', 'freight-warning']) {
  const blindShipping = mode === 'true';
  const preparation = mode === 'prepare';
  test(`mock transport: complete fresh flow, mode=${mode}`, async () => {
    let part: Row = {}, orderDs: Dataset = {}, shipment: Dataset = {}, moved = false;
    if (mode === 'picked-order') part = {Company: 'EPIC06', PartNum: 'M1', IUM: 'EA', SalesUM: 'EA', NonStock: false, QtyBearing: true};
    const quantity = mode === 'misc-master' ? 7 : 8;
    const sourceBin = mode === 'misc-master' ? '00-00-01' : '00-00-00';
    let miscPack: Dataset = {}, masterPack: Dataset = {};
    const calls: string[] = [];
    const wrap = (ds: Dataset, outputs: Row = {}) => ({parameters: {ds, ...outputs}});
    const base = {Company: 'EPIC06', Plant: 'MfgSys'};
    const allocation = () => ({...base, OrderNum: 9000, OrderLine: 1, OrderRelNum: 1,
      PartNum: part.PartNum, WarehouseCode: 'CHI', OurReqQty: quantity});
    const queue = () => ({...base, MtlQueueSeq: 1800, SysRowID: 'queue-id', OrderNum: 9000,
      OrderLine: 1, OrderRelNum: 1, PartNum: part.PartNum, Quantity: quantity, IUM: 'EA',
      TranType: 'STK-SHP', TranStatus: 'RELEASED', FromWhse: 'CHI', FromBinNum: sourceBin,
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
      if (mode === 'misc-master' && op === 'GetByCustID') response = {returnObj: {Customer: [{Company:'EPIC06',CustNum:12,CustID:'ECD'}], ShipTo: [{CustNum:12,ShipToNum:'EDA-A'}]}};
      else if (mode === 'misc-master' && op === 'GetList') {
        const table = path.includes('ReasonSvc') ? 'ReasonList' : path.includes('ShipViaSvc') ? 'ShipViaList' : 'MiscShipToList';
        const row = table === 'ReasonList' ? {Company:'EPIC06',ReasonType:'M',ReasonCode:'ADD',Description:'Add New Part'} :
          table === 'ShipViaList' ? {Company:'EPIC06',ShipViaCode:'F92',Description:'FedEx Ground'} :
          {Company:'EPIC06',CustNum:14,ShipToNum:'',Name:'East Coast Distribiution - Albany'};
        response = {returnObj: {[table]:[row]}, parameters:{morePages:false}};
      }
      else if (mode === 'misc-master' && op === 'GetByID' && !path.includes('SalesOrderSvc')) {
        const query = new URL(url).searchParams;
        let saved: Dataset;
        if (path.includes('PartSvc')) saved = {Part:[part],PartPlant:[{...base,PartNum:part.PartNum}],PartWhse:[{...base,PartNum:part.PartNum,WarehouseCode:'CHI',PrimBinNum:sourceBin}]};
        else if(path.includes('CustomerSvc')) saved={Customer:[{Company:'EPIC06',CustNum:14,CustID:'EDA',Name:'East Coast Distribiution - Albany'}]};
        else if(path.includes('MiscShipSvc')) saved=miscPack;
        else if(path.includes('MasterPackSvc')) saved=masterPack;
        else if(path.includes('WhseBinSvc')) saved={WhseBin:[{Company:'EPIC06',WarehouseCode:query.get('warehouseCode'),BinNum:query.get('binNum'),InActive:false}]};
        else if(path.includes('WarehseSvc')) saved={Warehse:[{...base,WarehouseCode:query.get('warehouseCode')}]};
        else if(path.includes('EmpBasicSvc')) saved={EmpBasic:[{Company:'EPIC06',EmpID:'105',EmpStatus:'A'}]};
        else if(path.includes('PackingSvc')) saved={Packing:[{Company:'EPIC06',PkgCode:'BOX'}]};
        else if(path.includes('UOMSvc')) saved={UOM:[{UOMCode:query.get('uoMCode')}]};
        else throw new Error('Unexpected master read');
        response={returnObj:structuredClone(saved)};
      }
      else if (mode === 'misc-master' && op === 'GetNewPart') response=wrap({Part:[{...base,IUM:'EA',SalesUM:'EA',NonStock:false,QtyBearing:true,UnitPrice:0,SchedBcode:'',RowMod:'A'}]});
      else if (mode === 'misc-master' && op === 'Update' && path.includes('PartSvc')) {part=structuredClone((ds.Part as Row[])[0]);response=wrap(ds);}
      else if (mode === 'misc-master' && path.includes('MiscShipSvc')) {
        if(op==='GetNewMscShpHd') response=wrap({MscShpHd:[{...base,PackNum:0,ShipStatus:'OPEN',RowMod:'A'}],MscShpDt:[]});
        else if(op==='GetAddrInfo') response=wrap({...ds,MscShpHd:[{...(ds.MscShpHd as Row[])[0],CustNum:14,Name:'East Coast Distribiution - Albany'}]});
        else if(op==='GetCallInfo') {expect(b.updatedField).toBe('Order');response=wrap(ds);}
        else if(op==='GetPackaging') { expect((ds.MscShpHd as Row[])[0].PkgCode).toBe('BOX'); response=wrap(ds); }
        else if(op==='GetNewMscShpDt') response=wrap({...ds,MscShpDt:[{Company:'EPIC06',PackNum:500,RowMod:'A'}]});
        else if(op==='OnChangePartNum'||op==='OnChangeQuantity') response=wrap(ds);
        else if(op==='Update') {miscPack=structuredClone(ds);(miscPack.MscShpHd as Row[])[0].PackNum=500;response=wrap(miscPack);}
        else if(op==='CalculateWeight') response={parameters:{calculatedWeight:14}};
        else if(op==='CloseCarton') {(miscPack.MscShpHd as Row[])[0].ShipStatus='CLOSED';response=wrap(miscPack);}
        else throw new Error('Unexpected misc transition');
      }
      else if (mode === 'misc-master' && path.includes('MasterPackSvc')) {
        if(op==='GetNewMasterPack') response=wrap({MasterPack:[{Company:'EPIC06',RowMod:'A'}],MasterPackDtl:[]});
        else if(op==='GetPackaging') { expect((ds.MasterPack as Row[])[0].PkgCode).toBe('BOX'); response=wrap(ds); }
        else if(op==='Update') {masterPack=structuredClone(ds);(masterPack.MasterPack as Row[])[0].PackNum=600;response=wrap(masterPack);}
        else if(op==='GetNewMasterPackDtl') {expect(b.mpackLine).toBe(600);response=wrap({...ds,MasterPackDtl:[{Company:'EPIC06',PackNum:600,RowMod:'A'}]});}
        else if(op==='CheckShipStatus') {expect((miscPack.MscShpHd as Row[])[0].ShipStatus).toBe('CLOSED');response={returnObj:'CLOSED'};}
        else if(op==='CartonExists') response={returnObj:false};
        else if(op==='GetShipDetails') response=wrap({...ds,MasterPack:[{...(ds.MasterPack as Row[])[0],CustNum:14,ShipToNum:''}]});
        else throw new Error('Unexpected master transition');
      }
      else if (op === 'Parts') { part = {...b}; response = part; code = 201; }
      else if (op.startsWith('Parts(')) { response = part; if (mode === 'misc-master' && !part.PartNum) code = 404; }
      else if (op === 'GetInventoryQtyAdj') response = {returnObj: {InventoryQtyAdj: [{...base, PartNum: part.PartNum, RowMod: ''}]}};
      else if (op === 'OnChangeWareHseCode') response = wrap({InventoryQtyAdj: [{...(ds.InventoryQtyAdj as Row[])[0], WareHseCode: b.wareHseCode}]});
      else if (op === 'OnChangeBinNum') response = wrap({InventoryQtyAdj: [{...(ds.InventoryQtyAdj as Row[])[0], BinNum: b.binNum, UnitOfMeasure: 'EA', OnHandQty: 0}]});
      else if (op === 'OnChangingAdjustQuantity') response = wrap({InventoryQtyAdj: [{...(ds.InventoryQtyAdj as Row[])[0], AdjustQuantity: b.adjustQuantity, NewOnHandQty: b.adjustQuantity}]});
      else if (op === 'PreSetInventoryQtyAdj') response = wrap(ds, {requiresUserInput: false});
      else if (op === 'SetInventoryQtyAdj') response = {parameters: {partTranPKs: 'stock-transaction'}};
      else if (op === 'GetFullBinSearch') response = {returnObj: {PartBinSearch: [
        {...base, PartNum: part.PartNum, WhseCode: 'CHI', BinNum: sourceBin, IUM: 'EA', AttributeSetID: 0, LotNumber: '', PCID: '', QtyOnHand: moved ? 10 - quantity : 10},
        ...(moved ? [{...base, PartNum: part.PartNum, WhseCode: 'SHP', BinNum: 'SHP-1', IUM: 'EA', AttributeSetID: 0, LotNumber: '', PCID: '', QtyOnHand: quantity}] : []),
      ]}};
      else if (op === 'GetNewOrderHed') response = wrap({OrderHed: [{...base, RowMod: 'A'}]});
      else if (op === 'ChangeSoldToID') response = wrap({OrderHed: [{...(ds.OrderHed as Row[])[0], CustNum: 12}]});
      else if (op === 'ChangeShipToID') response = wrap(ds);
      else if (op === 'Update' && path.includes('SalesOrderSvc')) {
        orderDs = structuredClone(ds);
        if (orderDs.OrderDtl) {
          (orderDs.OrderDtl as Row[])[0] = {...(orderDs.OrderDtl as Row[])[0], OrderLine: 1, OrderQty: quantity, UnitPrice: 0, ...((mode==='vat'||mode==='misc-master')?{XPartNum:''}:{})};
          orderDs.OrderRel = [{...base, OrderNum: 9000, OrderLine: 1, OrderRelNum: 1, WarehouseCode: 'CHI', OurReqQty: quantity, ...((mode==='vat'||mode==='misc-master')?{ShipToNum:'EDA-A'}:{})}];
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
      else if (op === 'GetRowsCustomParams') response = {returnObj: {MtlQueue: (mode==='product-code' || mode==='vat' || mode==='misc-master') && moved ? [] : [queue()]}, parameters: {morePages: false}};
      else if (op === 'Update' && path.includes('MaterialQueueSvc')) response = wrap({MtlQueue: [(ds.MtlQueue as Row[])[1]]});
      else if (op === 'PreGetNewIssueReturn') response = {parameters: {pcAction: '', pcMessage: '', pdQtyAvailable: 0}};
      else if (op === 'VerifyMtlQueueExists') response = {returnObj: true};
      else if (op === 'GetNewIssueReturn') response = wrap({IssueReturn: [{...base, PartNum: part.PartNum, OrderNum: 9000,
        OrderLine: 1, OrderRel: 1, MtlQueueRowId: 'queue-id', TranQty: quantity, RequirementQty: quantity,
        FromWarehouseCode: 'CHI', FromBinNum: sourceBin, ToWarehouseCode: 'SHP', ToBinNum: 'SHP-1', UM: 'EA', TranType: 'STK-SHP', RowMod: 'A'}]});
      else if (op === 'PrePerformMaterialMovement') response = wrap(ds, {requiresUserInput: false});
      else if (op === 'MasterInventoryBinTests') response = wrap(ds, noMessages(['pcNeqQtyAction','pcNeqQtyMessage','pcPCBinAction','pcPCBinMessage','pcOutBinAction','pcOutBinMessage']));
      else if (op === 'LockUnLockMtlQueForEmpID') response = wrap({MtlQueue: []});
      else if (op === 'PerformMaterialMovement') { moved = true; response = {parameters: {legalNumberMessage: '', partTranPKs: 'movement-1|movement-2'}}; }
      else if (op === 'GetNewShipHead') response = wrap({ShipHead: [{...base, PackNum: 0, RowMod: 'A'}], ShipDtl: []});
      else if (op === 'GetHeadOrderInfo') response = wrap({...ds, ShipHead: [{...(ds.ShipHead as Row[])[0], OrderNum: 9000, CustomerCustID: 'ECD', CustNum:12, BTCustNum: 12, ...((mode==='vat'||mode==='misc-master')?{ShipToNum:'EDA-A'}:{}), CreditHold: false, OrderHold: false}]}, {creditMessage: ''});
      else if (op === 'OnChangeShipViaCode') response = wrap(ds);
      else if (op === 'GetPackaging') response = wrap({...ds, ShipHead: [{...(ds.ShipHead as Row[])[0], PkgCode: b.ipPkgCode}]});
      else if (op === 'UpdateMaster') {
        expect(b.ipBTCustNum).toBe(12);
        shipment = structuredClone(ds);
        (shipment.ShipHead as Row[])[0] = {...(shipment.ShipHead as Row[])[0], PackNum: 400, SysRowID: 'header-id', ShipStatus: 'OPEN', RowMod: ''};
        if ((shipment.ShipDtl as Row[]).length) {
          expect((shipment.ShipDtl as Row[])[0].SellingInventoryShipQty).toBe(0);
          (shipment.ShipDtl as Row[])[0] = {...(shipment.ShipDtl as Row[])[0], PackLine: 1, SellingInventoryShipQty: quantity, RowMod: ''};
        }
        response = wrap(shipment, {...noMessages(['opReleaseMessage','opCompleteMessage','opShippingMessage','opLotMessage','opInventoryMessage','opLockQtyMessage','opAllocationMessage','opPartListNeedsAttr','opLotListNeedsAttr','shipCreditMsg','msg','opPostUpdMessage']),
          cError: false, compError: false, checkComplianceError: false, changeStatusError: false, checkShipDtlAgain: false, updateComplete: true});
      }
      else if(op==='ChangeXPartNum') response=wrap(ds);
      else if(op==='GetByID' && path.includes('SalesOrderSvc')) response={returnObj:structuredClone(orderDs)};
      else if(op==='GetByID' && path.includes('CustomerSvc')) response={returnObj:{Customer:[{Company:'EPIC06',CustNum:12,UseBlindShipping:false}]}};
      else if (op === 'GetByID' && path.includes('CustShipSvc')) response = {returnObj: structuredClone(shipment)};
      else if (op === 'GetNewOrdrShipDtl') response = wrap({...ds, ShipDtl: [{...base, PackNum: 400, PackLine: 0, RowMod: 'A', SellingInventoryShipQty: 0}]});
      else if (op === 'GetOrderInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], OrderNum: 9000}]}, {creditMessage: ''});
      else if (op === 'AfterChangedShipDtlOrderNum') response = wrap(ds);
      else if (op === 'GetOrderLineInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], OrderLine: 1, PartNum: part.PartNum}]});
      else if (op === 'CheckPrePartInfo') response = {parameters: {partNum: part.PartNum, origPartNum: part.PartNum, vSubAvail: false, vMsgText: '', vMsgType: ''}};
      else if (op === 'GetOrderRelInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], OrderRelNum: 1, ...(mode==='product-code'?{XPartNum:'EP1Testing'}:mode==='vat'?{XPartNum:''}:{})}]});
      else if (op === 'GetWhseInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], WarehouseCode: 'SHP'}]});
      else if (op === 'ValidateBinCode') response = {};
      else if (op === 'GetQtyInfo') response = wrap({...ds, ShipDtl: [{...(ds.ShipDtl as Row[])[0], OurInventoryShipQty: b.displayInvQty}]});
      else if (op === 'ChangeStatus') { (shipment.ShipHead as Row[])[0].ShipStatus = 'CLOSED'; response = wrap(shipment); }
      else if (op === 'ConvertToManifestUOM' || op === 'UpdateTimeOut') response = {};
      else if (op === 'BuildCustFreightRequest') response = {returnObj: {
        MasterPackInfo: [], OrderInfo: [], PackInfo: [{...base, PackID: 400, FreightCarrier: 'F92', Weight: 3, WeightUOM: 'LB', PkgCode: 'BOX', SoldToUseBlindShipping: blindShipping}],
        OrderLine: [{PartNum: part.PartNum, QtyShip: quantity, QTYShipUOM: 'EA', UnitPrice: 0, SchedBcode: '1234.56.7899'}]}};
      else if (op === 'FreightCarton') response = {returnObj: {FreightCartonResponse: [{ErrorFlag: false, ErrorStatus: mode === 'freight-warning' ? 'Warning' : 'SUCCESS', ErrorMessage: 'Unable to obtain courtesy rates.', TransactionNumber: '600'}], FreightCartonResponseTracking: [{PackID: 400, TrackingNumber: 'tracking-local'}]}};
      else if (op === 'UpdateFreightedShipment') {
        (shipment.ShipHead as Row[])[0] = {...(shipment.ShipHead as Row[])[0], ShipStatus: 'FREIGHTED', MFTransNum: '600', TrackingNumber: 'tracking-local'}; response = {};
      } else throw new Error(`Unexpected transport operation: ${op}`);
      return {status: () => code, headers: () => ({'content-type': 'application/json'}), json: async () => structuredClone(response)};
    };
    const context = {get: transport, post: transport} as unknown as APIRequestContext;
    const client = new BaseClient(context, {baseUrl: 'https://example.test/api/v2/odata', company: 'EPIC06', timeoutMs: 90000});
    if(mode==='misc-master') {
      const progress: MiscMasterProgress={stage:'start'};
      await miscellaneousMasterPack(client,{partNum:'MISC-LOCAL-OWNED',company:'EPIC06',plant:'MfgSys',warehouse:'CHI',shippingWarehouse:'SHP',shippingBin:'SHP-1',employeeId:'105'},async(_name,action)=>action(),progress);
      expect(progress).toMatchObject({partNum:'MISC-LOCAL-OWNED',orderNum:9000,miscPackNum:500,masterPackNum:600});
      expect(calls.filter(c=>c==='CloseCarton')).toHaveLength(1);
      expect(calls.indexOf('CloseCarton')).toBeLessThan(calls.indexOf('CheckShipStatus'));
      expect(calls).not.toContain('GetNewShipHead');expect(calls).not.toContain('FreightCarton');
      return;
    }
    const progress: Progress = {stage: 'start'};
    const execution = (mode === 'picked-order' ? preparePickedOrder : preparation ? prepareCustomerShipment : customerShipment)(client, {company: 'EPIC06', customerId: 'ECD', employeeId: '105', plant: 'MfgSys',
      fromWhse: 'CHI', fromBin: sourceBin, toWhse: 'SHP', toBin: 'SHP-1', stockQty: 10, quantity: quantity,
      shipVia: 'F92', packageCode: 'BOX', weight: 3, unitPrice: 0, tariff: '1234.56.7899', blindShipping,
      ...(mode==='product-code'?{customerPartCode:'EP1Testing'}:{}),
      ...(mode==='picked-order'?{preparedPartNum:'M1'}:{}),
      ...(mode==='vat'?{shipToCode:'EDA-A',shipDate:'2026-11-19T00:00:00'}:{}),
      freightUrl: 'http://integration.test/service', workstation: 'PACK', freightTimeout: 60, partExtras: {}},
      async (_name, action) => action(), progress);
    if (mode === 'freight-warning') {
      await expect(execution).rejects.toThrow('ErrorStatus=Warning');
      expect(progress.freightResponse).toMatchObject({FreightCartonResponse: [{ErrorFlag: false, ErrorStatus: 'Warning', TransactionNumber: '600'}]});
      expect(calls.filter(c => c === 'FreightCarton')).toHaveLength(1);
      expect(calls).not.toContain('UpdateFreightedShipment');
      return;
    }
    const result = await execution;
    if (mode === 'picked-order') {
      expect('prepared' in result && result.prepared).toMatchObject({company:'EPIC06', partNum: part.PartNum, orderNum:9000, orderLine:1, orderRelease:1, queueSeq:1800, inventoryTransactions:'stock-transaction', movementTransactions:'movement-1|movement-2'});
      expect(result.progress).toMatchObject({partNum: 'M1', orderNum: 9000, queueSeq: 1800});
      expect((orderDs.OrderHed as Row[])[0].ReadyToFulfill).toBe(true);
      expect(calls).not.toContain('Parts');
      expect(calls).not.toContain('GetNewShipHead');
      expect(calls).not.toContain('FreightCarton');
      expect(calls.filter(c => c === 'PerformMaterialMovement')).toHaveLength(1);
      return;
    }
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
