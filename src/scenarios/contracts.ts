import { PickingApi } from '../api/pickingApi';
import { ShipmentApi } from '../api/shipmentApi';
import type { BaseClient } from '../api/baseClient';
import { json, parameters, returned, rows, one, identity, dataset, stringsEmpty } from './support';
export type Row = Record<string, unknown>;
export type Dataset = Record<string, unknown>;
export interface ShippingContracts {
  beforeInitialize(client: BaseClient, queue: Row): Promise<void>;
  verifyQueueBeforeMovement(client: BaseClient, queue: Row, ds: Dataset): Promise<Dataset>;
  prepareNewShipmentQuantity(client: BaseClient, ds: Dataset, quantity: number): Promise<Dataset>;
  readFreightResult(body: Row, packNum: number): Dataset;
}
export function requireShippingContracts(): ShippingContracts {
  return {
    async beforeInitialize(client, queue) {
      const p = parameters(await json(new PickingApi(client).preGetNewIssueReturn(String(queue.SysRowID)), 'Check movement initialization'));
      // No action-value mapping was supplied. Only the no-action/no-message branch continues.
      stringsEmpty(p, ['pcAction', 'pcMessage']);
      if (typeof p.pdQtyAvailable !== 'number' || !Number.isFinite(p.pdQtyAvailable)) throw new Error('Invalid preparation quantity.');
      // The authoritative source-stock read is checked separately before commit.
    },
    async verifyQueueBeforeMovement(client, queue, ds) {
      const result = await json(new PickingApi(client).verifyMtlQueueExists(String(queue.SysRowID)), 'Verify material queue');
      if (result.returnObj !== true) throw new Error('Material queue no longer exists; movement stopped.');
      return ds; // Queue verification returns a boolean, not an IssueReturn dataset.
    },
    async prepareNewShipmentQuantity(client, ds, quantity) {
      const line = one(ds, 'ShipDtl');
      return dataset(await json(new ShipmentApi(client).getQtyInfo(Number(line.PackLine), quantity, 0, ds), 'Set new shipment quantity'));
    },
    readFreightResult(body, packNum) {
      const result = returned(body);
      const status = one(result, 'FreightCartonResponse');
      identity(status, {ErrorFlag: false, ErrorStatus: 'SUCCESS'});
      if (!String(status.TransactionNumber ?? '').trim()) throw new Error('Missing freight transaction.');
      const tracking = rows(result, 'FreightCartonResponseTracking');
      if (tracking.length !== 1 || tracking[0].PackID !== packNum ||
          typeof tracking[0].TrackingNumber !== 'string' || !tracking[0].TrackingNumber.trim()) {
        throw new Error('Freight tracking does not identify this pack.');
      }
      return result; // Retain BOTH tables and their original RowMod/SysRowID values.
    },
  };
}
