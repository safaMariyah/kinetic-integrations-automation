import type { WorkflowProgress } from '../support/workflow';
import type { Row, Dataset } from '../support/datasets';

export interface ScenarioInput {
  preparedPartNum?: string;
  company: string; customerId: string; employeeId: string; plant: string;
  fromWhse: string; fromBin: string; toWhse: string; toBin: string;
  stockQty: number; quantity: number; shipVia: string; packageCode: string;
  weight: number; unitPrice: number; tariff: string; blindShipping: boolean;
  freightUrl: string; workstation: string; freightTimeout: number;
  partExtras: Row;
  shipDate?: string;
  shipToCode?: string;
  customerPartCode?: string;
  customerPartRevision?: string;
  internalPartRevision?: string;
  createOwnedMapping?: boolean;
}
export interface Progress extends WorkflowProgress {
  freightResponse?: Row;
  customerPartMappingId?: string;
  customerPartCode?: string;
  stage: string; partNum?: string; orderNum?: number; orderLine?: number;
  orderRelease?: number; queueSeq?: number; packNum?: number;
  inventoryTransactions?: string; movementTransactions?: string; freightTransaction?: string;
}
export type { WorkflowStep as Step } from '../support/workflow';


/** Shared preparation has no dependency on shipment or carrier settings. */
export type PreparationInput = Pick<ScenarioInput, 'preparedPartNum' | 'company' | 'customerId' | 'employeeId' | 'plant' |
  'fromWhse' | 'fromBin' | 'toWhse' | 'toBin' | 'stockQty' | 'quantity' | 'unitPrice' | 'tariff' | 'partExtras' |
  'shipToCode' | 'customerPartCode' | 'customerPartRevision' | 'internalPartRevision' | 'createOwnedMapping'>;

export interface PreparedStock {
  readonly company: string; readonly plant: string; readonly partNum: string;
  readonly inventoryTransactions: string;
}
export interface PreparedOrder extends PreparedStock {
  readonly orderNum: number; readonly orderLine: number; readonly orderRelease: number; readonly quantity: number;
  readonly savedOrderCustomerPart?: string;
}
export interface PickedOrder extends PreparedOrder {
  readonly queueSeq: number; readonly movementTransactions: string;
  readonly shippingWarehouse: string; readonly shippingBin: string;
}

export interface PreparedShipment extends PickedOrder {
  readonly packNum: number; readonly shipment: Dataset;
}
export interface FreightedShipment extends PreparedShipment {
  readonly freightRequest: Dataset; readonly freightTransaction: string; readonly trackingNumber: string;
}
