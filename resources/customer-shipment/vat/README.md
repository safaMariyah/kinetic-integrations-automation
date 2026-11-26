Latest separately authorized fresh full execution: PASS (2026-11-19), one test/worker, zero retries. Order8147 / pack333 / QuickShip558 / tracking794912123667. Both actual VAT mappings, carrier SUCCESS, persisted outcomes and supported shipment scope passed. Evidence: ../run-evidence/vat-fresh-full-live-pass.json. Earlier FAIL remains preserved with unchanged report/evidence hashes; historical entries below describe that earlier run. No cleanup or VAT restoration.

# Customer billing and ship-to VAT

Latest authorized live execution: FAIL at final QuickShip shipment companyId assertion. VAT saves, shipment/freight persistence, both actual outgoing VAT mappings and carrier response passed. See ../run-evidence/vat-original-live-outcome.json. The original failure is preserved; no rerun/refreight/restore/cleanup occurred. Earlier implementation-only checks below describe the pre-live delivery.

The test saves BillingVAT on EPIC06 customer ECD and SHIPTOVAT on its EDA-A ship-to, independently reads both, then provisions stock/order/picking/shipment and checks the actual outgoing freight request and carrier outcome. The user explicitly selected this shared-master strategy for a future run, superseding the earlier isolated-customer choice. No master, inventory, ERP business or carrier writes were executed during implementation.

Current application metadata confirms Billing VAT ID = Customer.CustomerVATNum and ship-to VAT ID = ShipTo.ShipToVAT. CheckVATFormat is attached to ResaleID (Tax ID), so it is deliberately absent from the VAT edit path. CustomerSvc.Update receives the full returned dataset, retaining revisions/defaults/unrelated ship-tos, with only the selected row marked U. Each save is followed by a separate GetByCustID read.

The source's illustrative EP1 becomes a unique APIPOC purchased stock part to avoid changing shared parts; its price 1, tariff 2222.22, adjustment 200 and shipment quantity 100 are preserved. No customer-part cross-reference is created; the persisted order customer-part field must match the pack line. Sample order/pack/customer IDs, date and inconsistent sample weights/quantities are not runtime constants. BillingVAT and SHIPTOVAT remain exact distinct values under test. Source prose (login passwords redacted), all 27 step IDs and expected results are retained in source-prose.txt and scenario.json; coverage.md maps their API equivalents. UI screen rendering and print dialogs are navigation, outside the API-only regression.

Reuse: CustomerShipment uses purchasedPart/PartApi (8-9), InventoryApi (10), SalesOrderApi (12-13), FulfillmentApi/fulfillment/allocationTemplate (14-21), ShipmentApi (22-24), FreightApi (25), quickShipReader (26), and quickShip artifact/response readers (27). Optional shipToCode/shipDate extensions preserve the existing Product Code and blind-shipping paths. VAT also enables the existing independent queue-disappearance reader.

Preflight checks the exact approved company/customer/ship-to/VAT values, selected master existence, false customer blind-shipping prerequisite, configured locations/carrier/package, allocation context, timeouts, confirmed artifact provenance/access, fresh QuickShip company scope, and existing REST integration/PACK manifest logging. Existing installation, active IN UOM, valid carrier/warehouse/employee setup and inventory permissions remain prerequisites; the test does not configure shared setup. Its barrier now validates real dependencies rather than throwing unconditionally.

Run commands from C:\Users\safa.mariyah\kinetic-api-tests:

```powershell
npm.cmd run check
npm.cmd run test:local
npm.cmd run list:live
python .agents/skills/epicor-api-poc-mentor/scripts/validate_scenario.py resources/customer-shipment/vat/scenario.json
```

All PASS: typecheck, 31 local tests, 6 live tests discovered, and structural scenario validation. Local transport tests exercise VAT save/read persistence, retained nonselected ship-tos/revisions, missing ship-to before writes, uncertain-write no retry, false save success, swapped/fallback VAT, wrong identities/run, and full selected-ship-to shipment orchestration. Mocks do not prove ERP/carrier execution.

QuickShip interactive refresh command:

```powershell
node .\scripts\refresh-quickship-session.cjs
```

The interactive window was unavailable to the user in this agent session. The existing supported login-quickship.cjs login-only path succeeded using previously supplied credentials held only in process memory. A separate fresh API reader then loaded the saved state at C:\Users\safa.mariyah\kinetic-api-tests\.auth\quickship.json. Saved authentication and configured registrationcode header were present, and /api/company/getCompany verified configured company GUID and EPIC06. See quickship-readiness.json. No shipment record was opened. Fresh readiness recheck:

```powershell
node .\scripts\verify-vat-quickship-readiness.cjs
```

Configuration is loaded by playwright.config.ts from .env. Required: EPICOR_BASE_URL/COMPANY/USERNAME/PASSWORD/API_KEY, API_REQUEST_TIMEOUT_MS, POC_EMPLOYEE_ID/PLANT/FROM_WHSE/FROM_BIN/TO_WHSE/TO_BIN/SHIP_VIA_CODE/PACKAGE_CODE, EPICOR_FREIGHT_URL/WORKSTATION_ID, QUICKSHIP_REQUEST_DIRECTORY/BASE_URL/REGISTRATION_CODE/STORAGE_STATE/COMPANY_ID. Optional: EPICOR_FREIGHT_TIMEOUT (60), POC_PART_EXTRAS_FILE. discovery.local.json must confirm the actual artifact directory; machine paths remain there, not in test code. Approved TLS trust for Kinetic is required; this environment uses:

```powershell
$env:NODE_EXTRA_CA_CERTS = (Resolve-Path .auth\kinetic-ca.pem).Path
```

Future live command, NOT EXECUTED and requiring separate exact target/scope authorization:

```powershell
npm.cmd run test:live -- tests/customer-shipment/customer-vat.spec.ts
```

Retained effects of a future run: changed shared VAT values, unique part and stock, order, movement, pack, freight/carrier/label effects. There is no automatic restoration or cleanup. Attachments retain VAT-only before-images/intended changes and run checkpoints/returned identities. On uncertain writes, inspect authoritative state before any recovery; never rerun automatically. The script never retries mutations and rejects warnings/incomplete saves. Actual integration request correlation uses fresh order/pack identities and rejects ambiguous matches; the carrier response matches returned freight transaction, pack and tracking. QuickShip shipment number and internal GUID remain separate from the Kinetic pack.

No unresolved business decision or technical implementation blocker remains. Live write semantics, persisted freight outcome and actual VAT export still require the separately authorized run. The prior preflight-only claims reflected investigation not yet performed; available original specs, live metadata reads and retained code resolved them.

Reusable lessons: inspect application bindings to distinguish VAT ID from Tax ID and country-specific fields; inspect event triggers before adding validation calls. Search existing orchestration before declaring missing business assertions. A master-data policy is a business decision; writable field bindings, datasets and operation payloads are technical discovery. Authentication success must be checked through a new reader loaded from saved state, rather than inferred from browser login.

Live execution 2026-11-19: one test, one worker, zero retries. Order 8146, pack 332, QuickShip shipment/freight transaction 557, tracking 794912053358 retained. Independent diagnostic reads confirmed CustomerVATNum=BillingVAT and EDA-A ShipToVAT=SHIPTOVAT, actual correlated request values match, carrier response SUCCESS. QuickShip shipment companyId was 00000000-0000-0000-0000-000000000000 despite fresh readiness resolving EPIC06 to the configured nonzero GUID. This remains a failed scope assertion, not a passing end-to-end run. Shared VAT values were not restored. Before-values and original HTML/JUnit/results remain under ignored private captures.

Reader correction after the original run: the shipment-level zero companyId equality was unsupported by prior evidence. The shared reader now verifies the persisted ERP pack/company/site, correlated request workstation/registration and carrier response, QuickShip ERP/order/tracking reference, and fresh company/facility/workstation graph. Separate read-only verification of existing shipment557/order8146/pack332/tracking794912053358 PASS; both original VAT artifact mappings and carrier SUCCESS reverified with unchanged file hashes. Original live run and HTML/JUnit reports remain FAIL. No new end-to-end execution occurred. See ../run-evidence/vat-corrected-readonly-verification.json. The complete reasoning and reusable contract are in ../coverage.md, QuickShip scope correction (2026-11-19).
