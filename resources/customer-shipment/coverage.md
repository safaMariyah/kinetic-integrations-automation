# Customer shipment coverage

Stable IDs distinguish duplicate source headings 4 and 9; original heading/step references remain in source-prose.txt.

| Stable ID | Original heading | Status | Necessary evidence |
|---|---|---|---|
| create-shipment | original opening | Missing | Create-only stage without tracking, then freight with tracking. |
| customer-product-code | 2 | Missing | Capture field save and correlated outgoing product code. |
| blind-shipping | 3 | Partial | Only customer=false, shipment false/true; full truth table and live artifacts needed. |
| ud-freight | 4 first | Missing | Capture UD round trip. |
| ud-unfreight | 4 second | Missing | Capture unfreight and UD round trip. |
| vat | 5 | Missing | Verify customer and ship-to VAT. |
| rate-shop | 6 | Missing | Quote 33.06 and CO2 0.21; confirm applicability. |
| phantom-ud-freight | 7 | Missing | Multiple-container per-case UD correlation. |
| phantom-ud-unfreight | 9 first | Missing | Multiple-container unfreight correlation. |
| phantom-rate-shop | 9 second | Missing | Quote 122.25 and CO2 0.83; confirm applicability. |

Business ambiguities: blind-shipping JSON examples contradict requested flags; no precedence chosen. Stock/order/sample quantities differ (200/100 versus current 10/8 and sample packed quantities), as do price and tariff examples. Current zero-price POC does not satisfy all historical values. Exact quotes/CO2 above remain requirements with unresolved applicability, not nonempty checks.

Prerequisites outside this refactor: UD schema creation, model regeneration, IIS restarts, publishing, and shared customer configuration. Single-container artifact matching is a current limitation, not a phantom integration rule. No other shipment families are implemented.

Current local verification: baseline typecheck failed; 8/10 mocks passed. After refactor typecheck passes and 9 substantive mocks pass (one existence-only test removed). Two live variants discovered only. No live verification.

## Historical supplied evidence and assumptions

The following register describes supplied manual evidence and earlier package results, not new live execution. Earlier validation claims are superseded by the current results above.

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

## Create Shipment offline handoff (2026-11-13)

Scope is original opening case, steps 23�33, not blind shipping. Steps 24/25 require outgoing createShipment true/false. Steps 26�29 require CLOSED before the first Freight action, then Shipment Created without FREIGHTED status or tracking and an actual correlated QuickShip record/request. Steps 30�33 require subsequent Freight, outgoing false, FREIGHTED status and tracking in both systems. No scenario implementation or live verification is claimed.

Documented evidence: original Erp.BO.CustShipSvc.methods.json components/schemas/Erp.Tablesets.ShipHeadRow has boolean CreateShipment. Its presence does not prove that UpdateMaster accepts a changed value or how defaults/RowMod must be carried. Inspect the actual save and subsequent GetByID before implementing that transition.

Erp.BO.FreightServiceSvc.methods.json: BuildCustFreightRequest_input requires integer packID and output returnObj references FreightInfoRequestTableset. MasterPackInfoRow and PackInfoRow expose boolean CreateShipment. This supports candidate handoff inspection, not a proven mapping from ShipHead or permission to patch the built request.

FreightCarton_input requires freightURL, rdt (generic object), WorkStationID and integer httpTimeOut. FreightCarton_output.returnObj is generic object: no documented mandatory tracking, create-only success discriminator or table cardinality. Separately declared FreightCartonResponseRow has ErrorFlag/ErrorStatus/TransactionNumber; FreightCartonResponseTrackingRow has PackID/TrackingNumber. These declarations do not bind the generic response to either table or establish the no-tracking branch. UpdateFreightedShipment is described as updating the freighted shipment; applicability to create-only remains unresolved.

Existing implementation: FreightApi builds the request, calls FreightCarton, and updates freighted state; readFreightResult requires one nonempty tracking row. Keep it for its existing branch only. Do not rename blindShipping or weaken its assertions to simulate Create Shipment.

Candidate independent readers: CustShip GetByID for persisted CreateShipment/status/tracking/manifest state; QuickShip shipment lookup and container reads only after this run's IDs are known. Historical QuickShip observations prove neither import/create nor a successful ship contract. Actual outgoing request plus outcome artifacts must correlate pack, stage transaction and fresh run interval; latest-file selection is not evidence. Existing artifact response reader requires tracking and is unsuitable for stage one.

Remaining observations: exact checkbox save dataset/method and read-back; flag transfer into the built dataset and outgoing JSON; first-action response and persistence call; Shipment Created field/value; whether the second action resets CreateShipment automatically or requires a user edit; transaction identity and artifact naming for both stages. Preserve source expectations; no guessed sequence is executable.

Smallest proposed future discovery: after separate authorization of an exact disposable pack/company/workstation, attach capture before navigation, observe checkbox save and read-back, then first Freight and its persisted reads/artifacts, followed by second Freight only within explicit carrier-effect authorization. Even opening the record can cause background writes; Freight can create integration records, labels, charges or carrier transactions. No such navigation/actions occurred in this handoff.

Driver: node scripts/discover-shipment.cjs config.local.json. Ignored JSON configuration requires url, origins (explicit approved origin list), apiPrefixes (explicit path prefixes), and optional storageState (ignored local path). Cross-origin requests outside the list are blocked. Login/SSO origins must be explicitly approved. Listeners precede navigation; JSON is key-redacted, non-JSON omitted, failures recorded, pending handlers drained on close. Captures remain ignored and require manual PII/embedded-secret review before sharing; redaction is not comprehensive. No automatic business actions or mutation retries are implemented.

Handoff checks: npm.cmd run check PASS; npm.cmd run test:local 9/9 PASS; node --check discovery driver PASS; bundled capture tests 8/8 PASS. Python skill suite 34/35 PASS, one ERROR because Windows denies symlink creation (WinError 1314), not a contract assertion failure. Matching Chromium 1234 installed using the installed Playwright CLI; local about:blank smoke PASS. Installer removed unused older browser caches. No business navigation or API calls. QUICKSHIP_REQUEST_DIRECTORY is not configured in the local environment; example path is not evidence of accessible artifacts. Need the actual accessible request/outcome directory or approved read route for both stage transactions, exact target/company/workstation and authorized login context before discovery. Machine settings, extraction bundles, captures and auth remain ignored.
