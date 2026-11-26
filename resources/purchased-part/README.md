# Create Purchased part

Entry point: tests/customer-shipment/purchased-part.spec.ts. Complete implementation; live outcome UNVERIFIED. No live requests executed. The attachment describes an older VAT task; the current purchased-part prose defines this delivery.

Source steps assigned in supplied order (source had no IDs):

| ID | Original instruction | API coverage |
| --- | --- | --- |
| S1 | Go to Part. Main menu > Material Management>Inventory Management>Setup>Part | Navigation; no API action required |
| S2 | On the landing page, click the Plus icon to create a new Part | POST Parts, require absent EP1 first |
| S3 | Set Part & Description = EP1 | Persisted PartNum and PartDescription assertions |
| S4 | Make sure Type = Purchased | Persisted TypeCode=P assertion |
| S5 | On the left navigation menu go to Part tab | Navigation |
| S6 | Scroll down and set Sales Unit Price = 1.00 | Persisted UnitPrice=1 assertion |
| S7 | Save | Independent GET after POST; 201 alone insufficient |

EP1 and price are preserved literally; no unique suffix or substitution. Existing EP1 blocks creation, never updates it. Reuses PartApi, buildPurchasedStockPart, baseClient and json. Count/EA UOM and standard-cost stock defaults come from the existing builder; target availability is unverified. No inventory quantities or shipments are in scope.

Evidence: create-contract.json is focused original OpenAPI extraction using query_catalog.py, service Erp.BO.PartSvc, operation Add_UpdateExt_Parts. POST calls UpdateExt directly; documented UnitPrice is base selling price and TypeCode P means purchased. Existing skill examples/customer-shipment/part-contracts.md provides historical baseline create/read evidence. Runtime tenant rules and target version remain unverified. No method order is inferred from field discovery.

Future execution requires authorization to create and retain EP1 in the exact target. Set PART_CREATE_AUTHORIZED_TARGET to the exact EPICOR_BASE_URL + pipe + EPICOR_COMPANY + pipe + EP1 only after authorization, then run:

    npm.cmd run test:live -- tests/customer-shipment/purchased-part.spec.ts

NOT EXECUTED. Zero retries; uncertain saves require independent inspection before any rerun. No cleanup implemented. Run artifacts preserve creation intent; successful ERP creation remains retained even if later validation fails.

Reusable lesson: preserve literal master identities and reject collisions before writes; use an independent read for price/type persistence. Local checks cannot establish tenant acceptance.
