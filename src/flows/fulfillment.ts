import { FulfillmentApi } from '../api/fulfillmentApi';
import type { BaseClient } from '../api/baseClient';
import { json, parameters, returned, rows, one, identity, dataset, stringsEmpty, type Row, type Dataset } from '../support/datasets';

export async function beforeInitialize(client: BaseClient, queue: Row) {
      const p = parameters(await json(new FulfillmentApi(client).preGetNewIssueReturn(String(queue.SysRowID)), 'Check movement initialization'));
      // No action-value mapping was supplied. Only the no-action/no-message branch continues.
      stringsEmpty(p, ['pcAction', 'pcMessage']);
      if (typeof p.pdQtyAvailable !== 'number' || !Number.isFinite(p.pdQtyAvailable)) throw new Error('Invalid preparation quantity.');
      // The authoritative source-stock read is checked separately before commit.
    }
    export async function verifyQueueBeforeMovement(client: BaseClient, queue: Row, ds: Dataset) {
      const result = await json(new FulfillmentApi(client).verifyMtlQueueExists(String(queue.SysRowID)), 'Verify material queue');
      if (result.returnObj !== true) throw new Error('Material queue no longer exists; movement stopped.');
      return ds; // Queue verification returns a boolean, not an IssueReturn dataset.
    }
