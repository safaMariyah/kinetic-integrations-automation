import type { ScenarioInput, Progress, PreparationInput } from './shipmentTypes';

/** Configuration-only validation: failures here precede the first business request. */
export function validatePreparation(input: PreparationInput): void {
  for (const field of ['company', 'customerId', 'employeeId', 'plant', 'fromWhse', 'fromBin', 'toWhse', 'toBin'] as const) {
    if (!input[field]?.trim()) throw new Error(`Preparation requires ${field}. Correct scenario configuration before creating ERP records.`);
  }
  if (!Number.isFinite(input.stockQty) || input.stockQty <= 0 || !Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > input.stockQty) {
    throw new Error('Preparation requires positive stock/shipment quantities with stock covering shipment quantity. No records were created.');
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) throw new Error('Preparation requires a finite nonnegative unit price.');
  if (input.createOwnedMapping && (input.customerPartCode === undefined || input.customerPartRevision === undefined || input.internalPartRevision === undefined)) {
    throw new Error('Owned customer mapping requires explicit customer code, customer revision and internal revision before preparation. Blank revisions are allowed when required by the source.');
  }
}

export function validateFreightConfiguration(input: Pick<ScenarioInput, 'weight' | 'freightTimeout' | 'freightUrl' | 'workstation' | 'shipVia' | 'packageCode'>): void {
  for (const field of ['workstation', 'shipVia', 'packageCode'] as const) {
    if (!input[field]?.trim()) throw new Error(`Freight requires ${field} before shipment preparation.`);
  }
  if (!Number.isFinite(input.weight) || input.weight <= 0 || !Number.isFinite(input.freightTimeout) || input.freightTimeout <= 0) {
    throw new Error('Freight requires positive finite weight and service timeout.');
  }
  let url: URL;
  try { url = new URL(input.freightUrl); } catch { throw new Error('Freight service URL is invalid. Correct the environment configuration.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Freight service URL must use HTTP or HTTPS without embedded credentials or fragment.');
}

export function requirePreparationIdentity(progress: Pick<Progress, 'partNum' | 'orderNum' | 'orderLine' | 'orderRelease'>, stage: 'order' | 'picking' | 'shipment'): void {
  if (!progress.partNum?.trim()) throw new Error(`${stage} requires the prepared part identity. Run the preceding stock capability and retain its result.`);
  if (stage !== 'order') {
    for (const field of ['orderNum', 'orderLine', 'orderRelease'] as const) {
      if (typeof progress[field] !== 'number' || !Number.isFinite(progress[field]) || progress[field]! <= 0) throw new Error(`${stage} requires a saved ${field}. No dependent operation was started.`);
    }
  }
}
