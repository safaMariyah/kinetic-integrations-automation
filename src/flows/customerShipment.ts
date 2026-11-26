import { validateFreightConfiguration } from './scenarioPreflight';
import { checkpointSteps } from '../support/workflow';
import type { BaseClient } from '../api/baseClient';
import { one, identity, type Dataset } from '../support/datasets';
import { createOpenCustomerShipment } from './shipmentPreparation';
import { freightCustomerShipment } from './shipmentFreight';

export type { ScenarioInput, Progress } from './shipmentTypes';
import type { ScenarioInput, Progress, Step, PreparationInput, PickedOrder } from './shipmentTypes';
import { prepareOrderForShipping } from './orderPreparation';

async function executeShipment(
  client: BaseClient, input: ScenarioInput,
  step: Step, progress: Progress, preparationOnly = false,
): Promise<{progress: Progress; shipment: Dataset; freightRequest: Dataset}> {
  validateFreightConfiguration(input);
  const run = checkpointSteps(step, progress, () => console.log('Retained run checkpoint:', JSON.stringify(progress)));
  const picked = await prepareOrderForShipping(client, input, run, progress);
  const prepared = await createOpenCustomerShipment(client, input, picked, run, progress);
  const shipment = prepared.shipment;
  if (preparationOnly) {
    identity(one(shipment, 'ShipHead'), {ShipStatus: 'OPEN'});
    progress.stage = 'completed: OPEN pack preparation boundary';
    return {progress, shipment, freightRequest: {}};
  }
  return {progress, ...await freightCustomerShipment(client, input, run, progress, prepared)};
}

export async function prepareCustomerShipment(client: BaseClient, input: ScenarioInput, step: Step, progress: Progress) {
  return executeShipment(client, input, step, progress, true);
}
// Order/picking boundary shared by shipment families. No ShipHead/MscShpHd is created.
export async function preparePickedOrder(client: BaseClient, input: PreparationInput, step: Step, progress: Progress): Promise<{progress: Progress; prepared: PickedOrder; shipment: Dataset; freightRequest: Dataset}> {
  if (!input.preparedPartNum) throw new Error('Picking preparation requires an independently prepared part.');
  const run = checkpointSteps(step, progress, () => console.log('Retained run checkpoint:', JSON.stringify(progress)));
  const prepared = await prepareOrderForShipping(client, input, run, progress, true);
  return {progress, prepared, shipment: {}, freightRequest: {}};
}
export async function customerShipment(client: BaseClient, input: ScenarioInput, step: Step, progress: Progress) {
  return executeShipment(client, input, step, progress);
}
