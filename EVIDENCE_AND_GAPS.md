# Implementation evidence and remaining validation

This file supersedes the earlier draft gap register. No unresolved adapter placeholders remain.

| Contract/change | Evidence | Implementation |
| --- | --- | --- |
| PreGetNewIssueReturn | User-supplied schema: pcMtlQueueRowID; parameters.pcAction/pcMessage/pdQtyAvailable | PickingApi method; continue only on empty action/message |
| VerifyMtlQueueExists | User supplied MaterialQueue schema: sysRowID; boolean returnObj | Require returnObj===true; preserve current IssueReturn dataset |
| Warehouse | Current GetWhseInfo capture with packLine=0, SHP, WarehouseCode; returned bin blank | Carry returned ds forward |
| Bin | ValidateBinCode {ipWhse:SHP,ipBinNum:SHP-1}, response {} | Validate, then set the line's BinNum in the current dataset |
| Unsaved quantity | Current GetQtyInfo captures for line 0 at 7 then 8; selling quantity remains 0 | Allow PackLine=0; pass intended quantity directly; do not overwrite selling quantity |
| Header save | Pasted text(20261107-163435): updateComplete=true, pack324, bill-to customer12, header OPEN/BOX/F92/3LB | Dynamic pack and bill-to customer; assert warnings/error flags and saved header |
| Line save | Pasted text(20261107-165404): updateComplete=true; line0 becomes line1; inventory/selling 8/8 | Require inventory quantity before save; require both quantities after saved-state read |
| Close | Pasted text(20261107-165549): CLOSE command -> CLOSED header | Use fresh header SysRowID; read saved state |
| Freight handoff | User-pasted FreightCarton response and UpdateFreightedShipment request | Preserve returnObj as ds, both response tables, SUCCESS/ErrorFlag and pack tracking checks |
| Final saved state | Pasted text(20261107-165848): FREIGHTED, MFTransNum552, tracking794905386584, order8137/1/1 and 8/8 | Read back and compare status/transaction/tracking to this run's freight response |
| Actual outgoing request | User-pasted QuickShip request: pack324/order8137/current part, 8EA, BOX/3LB, IN, tariff1234.56.7899, price0, boolean false | Verify actual request file IDs, part, quantity, prices, tariff, UOM, package, weight, dimension UOM and strict boolean |
| Actual carrier response | User-pasted shipmentresponse_552, JSON encoded inside a JSON string | Decode at most twice; correlate SUCCESS, transaction, pack and tracking |

## Explicit scope choices

The final user said to leave the price issue and finish the test. This package uses price 0.00 and does not claim the historical 1.00 requirement passed. Default stock/order/pick/ship values are 10/8/8/8, based on the current POC, not the historical prose's 200/100 inputs. The two independent tests vary only the shipment flag with the shared customer's existing false prerequisite; no customer configuration is modified.

Prose mapping: steps1–7 remain installation/configuration prerequisites; steps8–10 are unique part/stock; steps11–18 order/allocation; steps19–20 pick/movement; steps21–22 shipment header/line; steps23–26 shipment flag plus customer=false prerequisite; steps27–28 Close/Freight; steps29–33 final saved state and actual QuickShip artifacts. The QuickShip UI listing and customer=true combinations are not independently automated.

## First-live validation assumptions

- SchedBcode is added to the PartSvc creation payload using the observed field spelling, followed by read-back. Its acceptance on new-part creation was not captured. The original workbook lists UnitPrice as a part input but not a verified Schedule B create input. Failure stops before adding stock.
- Only the no-action PreGetNewIssueReturn branch is implemented because no action-code enumeration was supplied. New messages/actions fail explicitly.
- GetRowsCustomParams order filtering and the combined fresh-data scenario have not been live-run here. Match business IDs and morePages; never use the latest unrelated queue.
- The true shipment-flag branch has local mock coverage, not live integration proof. An actual outgoing boolean false when true was requested fails the test.
- The real test runner must have access to fresh QuickShip artifact files. No guessed latest file or constructed JSON can count as integration evidence.

## Validation

10 local tests passed: two full mock transport runs (false/true), adapter availability, strict QuickShip request values, incomplete-save warnings, stale/ambiguous artifact rejection, missing-queue/action handling, unsaved-line quantity, freight handoff rejection, and nested response decoding/correlation. Both ERP variants were discovered. No live requests were issued. TypeScript compiler installation was blocked by HTTP403, so typechecking is explicitly unverified. CI report configuration is included; no pipeline execution is claimed.
