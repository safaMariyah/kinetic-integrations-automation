# Optional worked shipment example

## Contents
- Capability orientation
- Coverage and interpretation conflicts
- Verification limits

Use only for a matching shipment case. Inspect the actual supplied ZIP before using these symbols; the skill does not bundle a duplicate application. Source: retained inspection notes of the customer-shipment example, original prose and reported manual captures. Raw captures are not bundled and no fresh live verification is implied.

## Capability orientation

| Capability | Components | Reuse and limits |
| --- | --- | --- |
| HTTP/auth/lifecycle | src/api/baseClient.ts | Auth origin scoped; GET/POST return response+elapsedMs; retry/redirect zero; original TLS bypass is environment-specific; no systematic redactor |
| Part identity/create/read | src/data/payloadBuilders.ts; src/api/partApi.ts | Unique UUID part; direct POST and OData key escaping; tariff extension/read-back in scenario is not independently captured create contract |
| Stock adjustment | src/api/inventoryApi.ts; customerShipment.ts stock stage | Six-call dataset chain; reason and zero starting adjustment row are profile assumptions/checks; match independent bin reader |
| Sales order | src/api/salesOrderApi.ts; customerShipment.ts order stage | GetNewOrderHed, ChangeSoldToID, Update, GetNewOrderDtl, ChangePartNumMaster, ChangeSellingQtyMaster; inputs preserve string scalar types; returned OrderRel verifies release |
| Allocation | src/api/allocationApi.ts; allocationPayloadBuilders.ts | GetListFWB, merge rows, slim, CheckDates, AutoAllocation; original/changed PartAllocTran rows; warehouse/zone/group profile remains tenant-specific |
| Queue and movement | src/api/pickingApi.ts, movementApi.ts; contracts.ts | Find by generated order; reject pagination/ambiguity; select before/after; separate queue boolean/dataset from IssueReturn; only no-warning branch |
| Shipment | src/api/shipmentApi.ts; customerShipment.ts | Header/line/default/save/read, ValidateBinCode, unsaved PackLine=0, Close; dynamic pack/BTCustNum; customer=false flag scope |
| Freight | src/api/freightApi.ts; contracts.ts | Convert/build/carton/persist/read; complete response dataset retained; outbound rdt selects four tables only, unsafe to generalize |
| Integration | src/scenarios/quickShip.ts | Actual file polling, strict values/boolean, nested response JSON decoding; single container/line, IN/EA profile; numeric dimensions not asserted |
| Evidence/reporting | tests/api/customer-shipment-orchestration.spec.ts | Two independent false/true loops, preflight, finally IDs attachment, dispose; reports configured; no CI deployment supplied |
| Local validation | tests/local/*.spec.ts | 10 tests, two full mock transport flows; guard/warning/artifact cases; no ERP execution |


## Coverage and interpretation conflicts

| Original steps | Meaning | Current implementation/limit |
| --- | --- | --- |
| 1–7 | Integration installation, units, workstation/company configuration | Declared environment prerequisites; no installation/configuration API automation |
| 8–10 | Purchased part, price/tariff, stock | Fresh UUID part and adjustment implemented; stock10/ship8, price0 and current tariff profile differ from historical200/100/1.00/example tariff; approve/record deviations |
| 11–18 | Order/header/line/release, allocation, release to picking | Implemented using fresh part and generated order; hardcoded allocation master-data profile; not universal |
| 19–20 | Select queue, process IssueReturn movement to shipping | Implemented no-warning branch and independent bin checks; no automatic unknown-action override |
| 21–22 | Shipment header and line | Implemented dynamic pack/customer, validated bin, saved quantities/read-back |
| 23–26 | Blind-shipping flags | Two shipment flag variants under existing customer=false; no customer mutation or four-combination claim |
| 27–28 | Close and Freight/tracking | Implemented; saved-state and freight handoff checks; actual live status needs execution evidence |
| 29–33 | QuickShip listing and JSON | Actual request/response file assertions implemented; Shipments UI not independently queried; customer=true examples excluded pending resolution |

Historical truth-table conflict: step24 manifest checked→true; step25 manifest unchecked/customer checked→true; step26 neither→false. JSON step30 manifest only→true, step31 neither→false, step32 both→false and step33 customer only→false. Preserve contradictions; current two cases intentionally avoid customer=true scope. Don't infer full precedence from them.

Historical script/example quantities, weight, date and carrier descriptions differ; report approved profile rather than silently harmonizing. Today's date means business timezone at execution. API helper/service selection must come from exact contracts, not labels or absent OData entries. SalesOrderSvc, OrderAllocSvc, MaterialQueueSvc, IssueReturnSvc, CustShipSvc and FreightServiceSvc now have inspected implementations for the worked case. MoveRequestSvc/IMMoveRequestSvc remained unproven routes for existing picks; don't choose them without new evidence.

## Verification limits

The example has two independent shipment-flag variants under customer=false. It does not establish customer=true precedence. Independent SalesOrder post-save and post-movement queue reads were missing; numeric package dimensions were not asserted in outgoing artifacts. Request file correlation used internal IDs and modification time; tighten to an evidenced transaction correlation when available. Mocks verify local behavior only. Inspect current tests and run evidence before claiming any of these limits resolved.

## Focused example notes (load only as needed)

- [Part](part-contracts.md), [inventory adjustment](inventory-contracts.md)
- [Order and allocation](order-allocation-contracts.md), [picking and movement](picking-contracts.md)
- [Shipment](shipment-contracts.md), [freight and integration](freight-and-quickship.md)
- [Environment observations](environment-observations.md), [troubleshooting](troubleshooting.md)
