import { BaseClient } from './baseClient';
import type { Dataset, Row } from '../support/datasets';
export class FulfillmentApi {
  constructor(private readonly client: BaseClient) {}
  findQueue(orderNum: number, employeeId: string) {
    return this.client.post('/Erp.BO.MaterialQueueSvc/GetRowsCustomParams', {
      whereClause: `OrderNum = ${orderNum}`, fromDate: '', toDate: '', fromWhse: '', toWhse: '',
      tranType: '', selectedByEmpID: employeeId, excludeTransStatus: '', onlySelectedByEmp: false,
      onlyUnselected: false, pageSize: 0, absolutePage: 1,
    });
  }
  select(queue: Row, employeeId: string) {
    return this.client.post('/Erp.BO.MaterialQueueSvc/Update', {ds: {MtlQueue: [
      {...queue, RowMod: ''}, {...queue, SelectedByEmpID: employeeId, SelectedForProcessing: true, RowMod: 'U'},
    ]}});
  }
  prepare(ds: Dataset) { return this.client.post('/Erp.BO.IssueReturnSvc/PrePerformMaterialMovement', {ds}); }
  binTests(ds: Dataset) { return this.client.post('/Erp.BO.IssueReturnSvc/MasterInventoryBinTests', {ds}); }
  lock(queueSeq: number, employeeId: string) {
    return this.client.post('/Erp.BO.MaterialQueueSvc/LockUnLockMtlQueForEmpID', {
      ipTranStatus: 'USER-LOCK', ipMtlQueueSeq: queueSeq, ipEmpID: employeeId, ds: {MtlQueue: []},
    });
  }
  move(ds: Dataset) { return this.client.post('/Erp.BO.IssueReturnSvc/PerformMaterialMovement', {plNegQtyAction: false, ds}); }
  stock(partNum: string) {
    return this.client.post('/Erp.BO.PartBinSearchSvc/GetFullBinSearch', {
      partNum, whseCode: '', consolidateInvAttributes: true,
    });
  }
  getNewIssueReturn(queueRowId: string) {
  if (!queueRowId.trim()) {
    throw new Error('Queue SysRowID is required.');
  }

  return this.client.post(
    '/Erp.BO.IssueReturnSvc/GetNewIssueReturn',
    {
      pcTranType: '',
      pcMtlQueueRowID: queueRowId,
      pCallProcess: 'MaterialQueue',
      ds: {
        IssueReturn: [],
        LegalNumGenOpts: [],
        SelectedSerialNumbers: [],
        SNFormat: [],
      },
    },
  );
}

preGetNewIssueReturn(queueRowId: string) {
  return this.client.post(
    '/Erp.BO.IssueReturnSvc/PreGetNewIssueReturn',
    { pcMtlQueueRowID: queueRowId },
  );
}

verifyMtlQueueExists(queueRowId: string) {
  return this.client.post(
    '/Erp.BO.MaterialQueueSvc/VerifyMtlQueueExists',
    { sysRowID: queueRowId },
  );
}
  getQueueById(mtlQueueSeq: number) {
    if (!Number.isInteger(mtlQueueSeq) || mtlQueueSeq <= 0) {
      throw new Error('Material queue sequence must be a positive integer.');
    }

    return this.client.get(
      '/Erp.BO.MaterialQueueSvc/GetByID' +
      `?mtlQueueSeq=${mtlQueueSeq}`,
    );
  }

  findQueueForInspection(
  mtlQueueSeq: number,
  employeeId: string,
  toDate: string,
) {
  if (!Number.isInteger(mtlQueueSeq) || mtlQueueSeq <= 0) {
    throw new Error('Material queue sequence must be a positive integer.');
  }

  return this.client.post(
    '/Erp.BO.MaterialQueueSvc/GetRowsCustomParams',
    {
      whereClause: `MtlQueueSeq = ${mtlQueueSeq}`,
      fromDate: '',
      toDate,
      fromWhse: '',
      toWhse: '',
      tranType: '',
      selectedByEmpID: employeeId,
      excludeTransStatus: '',
      onlySelectedByEmp: false,
      onlyUnselected: false,
      pageSize: 0,
      absolutePage: 1,
    },
  );
}


  getListFWB(orderNum: number) {
    if (!Number.isInteger(orderNum) || orderNum <= 0) {
      throw new Error('Order number must be a positive integer.');
    }

    return this.client.post(
      '/Erp.BO.OrderAllocSvc/GetListFWB',
      {
        whereClause: ` OrderNum = '${orderNum}' `,
        pageSize: '0',
        absolutePage: '0',
      },
    );
  }

  mergeOrderAllocListsAndGetRows(
    demandListDs: Record<string, unknown>,
  ) {
    return this.client.post(
      '/Erp.BO.OrderAllocSvc/MergeOrderAllocListsAndGetRows',
      {
        ipLastDisplaySeq: '0',
        ds1: {},
        ds2: demandListDs,
      },
    );
  }
    getSlimOrderAlloc(ds: Record<string, unknown>) {
    return this.client.post(
      '/Erp.BO.OrderAllocSvc/GetSlimOrderAlloc',
      {
        ds,
      },
    );
  }
    checkDates(ds: Record<string, unknown>) {
    return this.client.post(
      '/Erp.BO.OrderAllocSvc/CheckDates',
      {
        ds,
      },
    );
  }
    autoAllocation(ds: Record<string, unknown>) {
    return this.client.post(
      '/Erp.BO.OrderAllocSvc/AutoAllocation',
      {
        cIPWhseList: '',
        cWhseType: 'All',
        ds,
      },
    );
  }

}
