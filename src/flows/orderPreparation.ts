import { validatePreparation } from './scenarioPreflight';
import type { BaseClient } from '../api/baseClient';
import type { PreparationInput, Progress, Step, PickedOrder } from './shipmentTypes';
import { prepareScenarioStock } from './stockPreparation';
import { prepareScenarioOrder } from './salesOrderPreparation';
import { prepareScenarioPicking } from './pickingPreparation';

/** Compose preparation without creating a customer or miscellaneous shipment. */
export async function prepareOrderForShipping(client: BaseClient, input: PreparationInput, run: Step, progress: Progress, readyToFulfill = false): Promise<PickedOrder> {
  validatePreparation(input);
  const stock = await prepareScenarioStock(client, input, run, progress);
  const order = await prepareScenarioOrder(client, input, stock, run, progress, readyToFulfill);
  return prepareScenarioPicking(client, input, order, run, progress);
}
