import { parameters, stringsEmpty, record, type Row, type Dataset } from '../support/datasets';

/** Validate all completion outputs; HTTP 200 alone does not establish a saved shipment. */
export function assertMasterSave(body: Row): Dataset {
  const p = parameters(body);
  stringsEmpty(p, ['opReleaseMessage','opCompleteMessage','opShippingMessage','opLotMessage',
    'opInventoryMessage','opLockQtyMessage','opAllocationMessage','opPartListNeedsAttr',
    'opLotListNeedsAttr','shipCreditMsg','msg','opPostUpdMessage']);
  for (const key of ['cError','compError','checkComplianceError','changeStatusError','checkShipDtlAgain']) {
    if (p[key] !== false) throw new Error(`Shipment save requires review: ${key}. Inspect saved state; do not repeat save.`);
  }
  if (p.updateComplete !== true) throw new Error('Shipment update incomplete. Inspect saved state; do not repeat save.');
  return record(p.ds);
}
