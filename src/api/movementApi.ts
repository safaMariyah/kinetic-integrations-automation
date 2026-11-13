import { BaseClient } from './baseClient';
import type { Dataset, Row } from '../scenarios/contracts';
export class MovementApi {
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
}
