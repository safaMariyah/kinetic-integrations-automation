import { randomUUID } from 'node:crypto';

import type { CreatePartPayload } from '../api/partApi';
// Preserve external type imports while the writable contract belongs to the API layer.
export type { CreatePartPayload } from '../api/partApi';

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
