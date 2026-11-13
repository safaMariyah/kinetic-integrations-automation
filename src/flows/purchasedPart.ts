import { randomUUID } from 'node:crypto';

export interface CreatePartPayload extends Record<string, unknown> {
  Company: string;
  PartNum: string;
  PartDescription: string;
  UOMClassID: string;
  IUM: string;
  PUM: string;
  SalesUM: string;
  TypeCode: 'P';
  CostMethod: 'S';
  NonStock: boolean;
  QtyBearing: boolean;
}

export function buildPurchasedStockPart(
  company: string,
): CreatePartPayload {
  const uniqueSuffix = randomUUID().replace(/-/g, '');

  return {
    Company: company,
    PartNum: `APIPOC-${uniqueSuffix}`,
    PartDescription: 'API POC purchased stock part',
    UOMClassID: 'Count',
    IUM: 'EA',
    PUM: 'EA',
    SalesUM: 'EA',
    TypeCode: 'P',
    CostMethod: 'S',
    NonStock: false,
    QtyBearing: true,
  };
}