import { test } from '@playwright/test';
import { requireCreateShipmentComplete, shipmentVariantPlan } from '../../src/flows/createShipment';
// Separate cases each require fresh preparation; neither can mutate while gaps remain.
test('source 24,26-32: checked initially, create-only then subsequent Freight', async () => {
  shipmentVariantPlan('checked-then-freight');
  requireCreateShipmentComplete();
});
test('source 25,26,30-32: unchecked initially, direct Freight', async () => {
  shipmentVariantPlan('unchecked-direct');
  requireCreateShipmentComplete();
});
