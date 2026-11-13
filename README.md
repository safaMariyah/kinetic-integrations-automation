# kinetic-api-tests

API-only TypeScript/Playwright shipment regression foundation. Only customer shipment exists: customer=false with shipment-level blindShipping false/true. Full prose coverage and live verification remain incomplete; see resources/customer-shipment/coverage.md.

Use installed dependencies with Node 22+. Keep credentials in ignored .env; .env.example documents connection/master data. Never commit auth state or raw captures. Scenario quantities and price live in the spec. The allocation profile is MfgSys/CHI, zone 00, Pickers; other warehouses require evidence and template validation.

```powershell
npm.cmd run check
npm.cmd run test:local
npm.cmd run list:live
# Explicit live execution creates retained ERP/carrier records:
npm.cmd run test:live -- --grep "blindShipping=false"
```

Local tests use mock transport. Live discovery spans tests/customer-shipment/**/*.spec.ts; use a spec path or --grep to select scenarios. Runs are serial and mutation retries are zero. Review retained IDs after failure before rerunning.

TLS verification is enabled. Obtain an approved CA chain from your administrator and configure Node trust (for example NODE_EXTRA_CA_CERTS pointing to an approved PEM before starting Node). Certificate requirements for the actual server remain unverified; no machine trust settings were changed.

```text
src/api/       shared transport and service operations
src/flows/     customerShipment, fulfillment, purchasedPart, allocationTemplate
src/support/   datasets, quickShip
tests/customer-shipment/blind-shipping.spec.ts
tests/local/   mock regression tests
resources/customer-shipment/{source-prose.txt,coverage.md}
```

The extensionless original resource was located and normalized to source-prose.txt; example login values were sanitized. Picking/movement/allocation services were merged into fulfillmentApi; shipmentApi became customerShipmentApi. The fixed ShippingContracts layer and old data/scenarios folders were removed; validations retain dataset handoffs. Root EVIDENCE_AND_GAPS.md was merged into coverage.md. BASELINE.md preserves original failures.

Next skill installation step: obtain the complete Epicor conversion skill package or repository URL (including SKILL.md and its referenced resources), review it, then install it using skill-installer. No complete skill package was supplied here; no substitute was invented.
