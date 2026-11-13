import { BaseClient } from './baseClient';

export class AllocationApi {
  constructor(private readonly client: BaseClient) {}

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