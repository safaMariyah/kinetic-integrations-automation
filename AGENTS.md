# Repository instructions

Use `.agents/skills/epicor-api-poc-mentor/SKILL.md` for Epicor prose-to-API work.
Inspect and reuse current exports in `src/api`, `src/flows`, and `src/support`, configuration in `src/api/baseClient.ts`, and the existing Playwright projects before extending any shipment family.
Search local catalogs and selected original specifications autonomously with the skill query tool. Discovery matches and field names do not establish writable contracts or operation order.
Keep regression tests API-only. Browser/network discovery is a separate, explicitly scoped activity.
Preserve original source-step IDs and substantive expected results in scenario coverage; record exclusions and gaps explicitly. Customer-shipment sources live under `resources/customer-shipment`; the blind-shipping baseline does not implement the two-stage createShipment case.
Run offline checks with `npm.cmd run check` and `npm.cmd run test:local`; `npm.cmd run list:live` only discovers tests. Live runs require applicable authorization and exact target/scope validation; generation and offline checks do not authorize live requests.
Machine-specific discovery paths belong in ignored `discovery.local.json`: JSON keys `catalog` (index directory) and `specDir` (original OpenAPI directory). Pass those values to query_catalog.py via `--catalog` and `--spec-dir`; this file is not automatically loaded. Store no credentials there.

Before capability/assertion changes inspect retained evidence and shared code. VAT records are under resources/customer-shipment/vat and resources/customer-shipment/run-evidence; original failures, corrected read-only checks and fresh passes remain distinct. Product Code unique-mapping approval does not prove earlier failure causes.

QuickShip refresh is implemented in scripts/refresh-quickship-session.cjs; inspect scope and authorization before use. Resolve QUICKSHIP_STORAGE_STATE exactly as the reader does and verify a fresh reader with required header presence without revealing values. Opening shipments can invoke applyBestWay. Shared scope logic/tests: src/support/quickShipReader.ts and tests/local/quickship-scope.spec.ts.

playwright.config.ts gives each invocation unique timestamp/UUID reports under captures/runs. Preserve original live evidence. Stage only task-specific files for maintenance commits.


## Architecture and generation rules

Live specs import `test` from `tests/fixtures.ts`. Fixtures own API contexts and
teardown; business mutations remain explicit scenario steps. Configuration lives
in `src/config`; session creation in `src/api/epicorSession.ts`; transport in
`src/api/baseClient.ts`. Existing compatibility exports are maintained.
Shared order/picking work belongs in `orderPreparation.ts`, and queue readers in
`fulfillmentReaders.ts`. New cases compose these capabilities; do not add flags
to unrelated scenarios or weaken existing acceptance checks to accommodate a case.
Inspect shared callers and evidence before changing a capability.

Runtime artifact provenance is in ignored `.runtime/config.json` (or
RUNTIME_CONFIG_FILE). Discovery paths remain in discovery.local.json. Temporary
investigation scripts belong in ignored `.runtime/scratch/`; maintained commands
belong under tools and reuse shared modules. Do not delete historical evidence.

Run `npm run doctor` for offline configuration/file readiness. It does not verify
session validity or authorize business requests. `npm run check` includes module
boundary validation. CI runs typecheck, boundary checks and offline regressions
on Linux and Windows; it performs no live requests. Preserve source-step IDs,
required identities and human-readable errors when adding scenarios.


Before generating a case, read README.md's Capability index for adding scenarios,
then inspect the selected exports and their current callers. Record capability
choices in the existing scenario coverage artifact. New stock/order/picking/pack
cases compose existing preparation and shipment capabilities. New code adds only
missing transitions and source-specific assertions. Typed preparation results own
handoff identities; Progress retains diagnostic checkpoints. Reuse still requires
review; architecture checks do not detect all duplicate business sequences.
