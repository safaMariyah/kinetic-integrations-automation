# Repository instructions

Use `.agents/skills/epicor-api-poc-mentor/SKILL.md` for Epicor prose-to-API work.
Inspect and reuse current exports in `src/api`, `src/flows`, and `src/support`, configuration in `src/api/baseClient.ts`, and the existing Playwright projects before extending any shipment family.
Search local catalogs and selected original specifications autonomously with the skill query tool. Discovery matches and field names do not establish writable contracts or operation order.
Keep regression tests API-only. Browser/network discovery is a separate, explicitly scoped activity.
Preserve original source-step IDs and substantive expected results in scenario coverage; record exclusions and gaps explicitly. Customer-shipment sources live under `resources/customer-shipment`; the blind-shipping baseline does not implement the two-stage createShipment case.
Run offline checks with `npm.cmd run check` and `npm.cmd run test:local`; `npm.cmd run list:live` only discovers tests. Live runs require applicable authorization and exact target/scope validation; generation and offline checks do not authorize live requests.
Machine-specific discovery paths belong in ignored `discovery.local.json`: JSON keys `catalog` (index directory) and `specDir` (original OpenAPI directory). Pass those values to query_catalog.py via `--catalog` and `--spec-dir`; this file is not automatically loaded. Store no credentials there.
