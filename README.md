# Epicor customer shipment orchestration

Implementation complete; locally tested with mock transport. Fresh live execution is not yet verified.

## What it does

Two independent API-only Playwright tests vary shipment-level blindShipping=false/true. Each test creates its own purchased stock part, adds 10 EA, creates an 8 EA order, allocates/releases, finds the new material queue, moves 8 EA to shipping, creates a new pack/line, closes, freights once, verifies saved tracking/status, and validates the actual QuickShip request AND response JSON files. Identifiers come from this run; no historical order/pack/queue number is reused.

Price is intentionally 0.00 per the user's final instruction. The expected tariff is 1234.56.7899. This is the current 10-stock/8-shipment POC profile, not an assertion that all historical prose values (200 stock, 100 ordered, 1.00 price) were fulfilled.

## Run in your Windows project

Use Node 22+ and your existing Playwright/TypeScript versions where already installed. Extract this package into a separate directory first; do not overwrite your existing project or populated `.env`. The included files preserve the supplied API classes and add the missing methods.

1. Install the declared dependencies if running standalone:

```powershell
npm install
```

2. Copy `.env.example` to `.env` ONLY if `.env` does not already exist. Fill EPICOR_USERNAME, EPICOR_PASSWORD and EPICOR_API_KEY locally. The example already contains the observed company, locations, carrier, workstation, quantities and zero-price setting. No credentials are bundled.

3. Set QUICKSHIP_REQUEST_DIRECTORY to a directory readable by the test runner that receives this run's actual QuickShip `shipmentRequest_*.json` and `shipmentresponse_*.json` files. The example server-local path will not work on another machine unless that folder is mounted/shared. A static old file cannot verify a new run. POC_PART_EXTRAS_FILE is optional; leave it blank for the included part builder.

4. Check the implementation:

```powershell
npm run check
npm run test:local
```

5. Run only the false variant first:

```powershell
npm run test:shipping -- --grep "blindShipping=false"
```

To run both independent variants:

```powershell
npm run test:shipping
```

These live commands CREATE and retain ERP parts, inventory transactions, orders, picks, shipment packs and carrier/integration records. Both variants create two complete sets. No cleanup or reversal is implemented. If a mutation times out or a save returns a warning, inspect the reported IDs before deciding what to run again. The test never repeats a mutation automatically.

## Main files

| File | Purpose |
| --- | --- |
| tests/api/customer-shipment-orchestration.spec.ts | Final entry point, two variants, configuration, JSON evidence, resource disposal and reporting |
| src/scenarios/customerShipment.ts | Complete business sequence and saved-state assertions |
| src/scenarios/contracts.ts | Implemented initialization, queue verification, new-line quantity and freight handoff |
| src/api/movementApi.ts | Queue discovery/selection, stock read, movement preparation, bin checks, lock and commit |
| src/api/shipmentApi.ts | Shipment methods, including unsaved PackLine=0 quantity support and ValidateBinCode |
| src/scenarios/quickShip.ts | Actual request/response file polling, nested JSON decoding, correlation and business assertions |
| tests/local/ | Mock-only regression tests; no live HTTP calls |

## Validation and limits

Ten local tests passed, including complete false/true orchestration against a mock transport. Both real ERP test variants were discovered using Playwright `--list`. Playwright transpilation/import checks passed. TypeScript typechecking could not be run here: dependency downloads were blocked with HTTP 403. Run `npm run check` in your existing project before live execution.

No live Epicor or QuickShip request was sent while generating this package. The user supplied successful manual evidence for pack 324/order 8137, transaction 552 and tracking ending 6584; that evidence does not prove a fresh automated run.

The part POST extends the previously successful builder with UnitPrice=0 and SchedBcode. SchedBcode is observed in shipment/freight output; its acceptance in the new-part create request still needs the first live validation. The test immediately reads the part back and stops before inventory adjustment if it was not persisted correctly. This is an implementation assumption, not a verified new-part input contract.

PreGetNewIssueReturn's action values were not enumerated. Only empty pcAction/pcMessage continues; unknown actions stop for review. Stock availability is independently checked. The queue lookup extends the numeric filter pattern to OrderNum and rejects incomplete/ambiguous responses.

Only the existing customer=false prerequisite is supported for the two shipment-flag variants. No shared customer flag is modified, and customer=true combinations from the contradictory original prose are not claimed. The true variant is implemented but has no supplied manual/live execution evidence. QuickShip file polling verifies actual outgoing artifacts; it does not independently query the QuickShip Shipments screen.

The original supplied Epicor-only TLS workaround (`ignoreHTTPSErrors: true`) remains unchanged; use approved certificate trust for a new environment. Workers=1, retries=0, network retries=0 and redirects=0 are preserved. HTML and JUnit reports are configured. Failure attachments contain only whitelisted IDs and the last stage, not raw customer/authentication payloads.
