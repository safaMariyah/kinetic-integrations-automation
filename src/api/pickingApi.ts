import { BaseClient } from './baseClient';

export class PickingApi {
  constructor(private readonly client: BaseClient) {}

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
    return this.client.post('/Erp.BO.IssueReturnSvc/PreGetNewIssueReturn', {pcMtlQueueRowID: queueRowId});
  }
  verifyMtlQueueExists(queueRowId: string) {
    return this.client.post('/Erp.BO.MaterialQueueSvc/VerifyMtlQueueExists', {sysRowID: queueRowId});
  }
}