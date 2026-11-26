# Miscellaneous shipment and master pack, steps 5?10

Implementation: **COMPLETE, Tier A for the evidenced simple-stock EPIC06/MfgSys/CHI branch; live verification UNVERIFIED**. Entry point: `tests/miscellaneous-shipment/miscellaneous-master-pack.spec.ts`. The previous unconditional completeness stub has been replaced by API orchestration and runtime prerequisite checks. No live business scenario was executed.

## Coverage

| Step | Implemented actions and verification |
| --- | --- |
| 5 | Get server Part defaults, create M1 / description M1, save, read independently, save primary bin 00-00-01 (create this new part's warehouse association if absent), read, save dimension UOM IN and net weight 2 LB, read attributes. Inventory/selling UOM remains the server's EA default. Tracking and nonstock branches are rejected. |
| 6 | Reuse InventoryApi initialize/change/default/prepare/commit. Add 10 to new M1; require reason ADD independently resolving to Add New Part, retain transaction keys, read source stock 10. |
| 7 | ECD / EDA-A, current Asia/Kolkata date, M1 quantity 7; independently read order state. Save ReadyToFulfill=true and read it back. Reuse allocation templates and compare all four exact source outcomes: 1 allocated, 0 cross docked, 1 selected for picking, 1 submitted for picking. No print request. |
| 8 | Find this run's exact order/line/release/part queue; validate source/destination and quantity, select, prepare, validate bins, lock, move once. Verify stock source 3 / destination 7 and queue disappearance. |
| 9 | Resolve Albany recipient independently from the customer master; initialize miscellaneous header, set recipient/address through GetAddrInfo, apply order through GetCallInfo(updatedField=Order), BOX, resolved FedEx Ground; save and read. Add M1 quantity 7 via part/quantity change methods; save and read. |
| 9?10 | User-approved addition: calculate weight from saved line/part, save weight, close this newly created miscellaneous pack once, independently verify CLOSED. |
| 10 | Create Misc master, OurBank blank per metadata, IndividualPackIDs=false, BOX, resolved FedEx Ground; save/read ID. GetNewMasterPackDtl receives parent PackNum as mpackLine. Require CheckShipStatus=CLOSED and CartonExists=false. First-pack metadata branch defaults details using GetShipDetails, then Update. Independently read both families and assert exact linkage, recipient, carrier, package, quantity and CLOSED constituent. |

Every original step and all four substantive expected results are retained in source-prose.txt and scenario.json. Navigation is represented by business capabilities. No substantive exclusions or quantity/part substitutions. User clarified IN is dimension UOM and ?both lines? means the single M1 line. User explicitly approved closing this new miscellaneous pack before adding it to master.

## Evidence and data ownership

Fresh read-only application metadata succeeded after resolving menu IDs from retained menu evidence: PartEntry / IMMT1102; MiscShipEntry / SRGO0020; MasterpackEntry / ASGO1200 (case matters). Selected events and source fingerprints are in application-contracts.json. Earlier candidate reads returned 400; they did not establish contracts. Focused original OpenAPI operations/references/fingerprints are in contracts.json; selectors in selection.json. The query tool used discovery.local.json's catalog and specDir explicitly. Original specs were preserved.

prerequisite-discovery.json records read-only evidence: M1 was absent (404); reason type M / ADD has description Add New Part; F92 resolves to FedEx Ground. ECD is customer 12 with EDA-A. The Albany recipient is customer 14, blank ship-to, with environment spelling **East Coast Distribiution - Albany**. Only that cosmetic spelling is normalized during candidate resolution; the actual customer number/name are independently read and asserted. ECD and the Albany recipient are kept distinct. Unexpected order-defaulting changes to the selected recipient stop the flow; live behavior of that branch remains unverified.

M1 is a fixed source identity. A run requires it absent and never overwrites, reuses or renames an existing M1. New part/order/inventory/movement/miscellaneous/master records remain after execution. There is no cleanup, rollback or automatic replay. Existing shared customer, bin, carrier, employee, reason, package and UOM masters are read only. Source warehouse/site are restricted to the evidenced allocation profile CHI/MfgSys in EPIC06. Shipping warehouse/bin and active employee come from existing POC settings. Source bin is always 00-00-01. Server Part defaults must be simple stock with inventory/sales EA; IN is never used as stock UOM. Price/tariff inherit actual Part defaults and are not imposed as unrelated source requirements.

Shared code reused: PartApi, InventoryApi, CustomerApi, SalesOrderApi, FulfillmentApi, dataset guards, allocation template, fulfillment.beforeInitialize / verifyQueueBeforeMovement and productCodeReaders.verifyMovedQueueAbsent. customerShipment now exposes preparePickedOrder, stopping before any shipment-family creation. Existing customer-shipment flows retain their existing boundaries. New adapters/readers are in src/api/miscShipmentApi.ts and src/flows/miscellaneousMasterPack.ts.

## Verification

- PASS: scenario structural validator; this does not validate API semantics or permission.
- PASS: `npm.cmd run check`.
- PASS: `npm.cmd run test:local` ? 43 tests, including mocked full steps 5?10, separate picking boundary, identity/correlation failures and no-mutation prerequisite failures. These are offline checks, not ERP proof.
- PASS: `npm.cmd run list:live`; discovery executes no live scenario.
- UNVERIFIED: fresh persisted ERP business outcomes; live mutations were not authorized/executed.
- N/A: QuickShip, freight, labels and external artifacts; this source ends at saving the master pack.

Existing .env configuration is preserved. Required settings: EPICOR_BASE_URL, EPICOR_COMPANY, EPICOR_USERNAME, EPICOR_PASSWORD, EPICOR_API_KEY; POC_PLANT=MfgSys; POC_FROM_WHSE=CHI; POC_TO_WHSE, POC_TO_BIN and POC_EMPLOYEE_ID. Use existing approved TLS trust (NODE_EXTRA_CA_CERTS pointing to .auth/kinetic-ca.pem where applicable). No secrets belong in source or discovery.local.json.

Offline commands:

```powershell
npm.cmd run check
npm.cmd run test:local
npm.cmd run list:live
python .agents/skills/epicor-api-poc-mentor/scripts/validate_scenario.py resources/miscellaneous-master-pack/scenario.json
```

Future live command **NOT EXECUTED**. Execute only after separate applicable live authorization. The test additionally requires MISC_MASTER_AUTHORIZED_TARGET equal to the normalized configured base URL followed by `|EPIC06|M1|10|7|close-misc|master`. This variable is an exact-scope guard, not authorization by itself.

```powershell
$env:MISC_MASTER_AUTHORIZED_TARGET = 'https://inb-512369.epicor.net/kinetic2027_100/api/v2/odata|EPIC06|M1|10|7|close-misc|master'
npm.cmd run test:live -- tests/miscellaneous-shipment/miscellaneous-master-pack.spec.ts
```

Use the exact case/path from the configured EPICOR_BASE_URL if it differs from the example. Workers=1, retries=0, no mutation redirects/retries, unique report directories under captures/runs. The test attaches retained run identities/transaction keys and last completed/started transition even on failure. If a write is uncertain, inspect authoritative state before recovery; the fixed M1 absence guard prevents blind whole-case retries.

Reusable lessons: resolve application names/menu IDs from retained evidence before guessing more routes; use actual application event chains to interpret misleading method parameters and validation return semantics. CartonExists=true means already assigned, not merely a valid carton. Master inclusion requires CLOSED. Dimension units and stock units differ. A customer-shipment preparation function that creates ShipHead is not an order/picking boundary for another shipment family.



## Approved repeatability update ? 26 November 2026

This supersedes the earlier fixed-M1 fresh-run data policy. The user approved
unique internal part identities per fresh miscellaneous run. Description M1,
quantities 10/7, dimensions IN, part weight 2 LB, recipient, F92/BOX and all
close/master linkage assertions remain. Every capability uses the generated
identity; existing M1 and prior records are preserved. Retained completion can
still use an explicit historical part identity. Original failures remain failures.

Fresh full live PASS: order 8172, miscellaneous pack 102, master pack 14;
part APIPOC-81ecac2cf8cf4e8b8c49fe6378928a8d. Evidence:
captures/runs/2026-11-26T11-12-39-322Z-3acc2459-a582-4e40-8f5e-2ce857fa48f8.
The manifest records unchanged source. This is separate from the previous recovery
of pack 101/master 13. ERP effects remain; no freight, carrier call or cleanup ran.
The current live-scope suffix is |unique-part|10|7|close-misc|master.
