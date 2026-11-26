# Demo cleanup audit — 2026-11-24

Archived at the same relative path beneath this directory:
- `skill-reference-addition.local.txt`: unused investigation/skill wording proposal; no imports, literal reads, CLI examples or documentation consumers found. Preserved without applying it to the installed skill.

Retained: all src helpers and tests (including blocked Create Shipment cases and locally tested helpers); scripts; package/configuration; .env, .auth and discovery.local.json; original prose and applicable contracts; all captures, source checkpoints, reports and failure evidence. Existing working-tree edits were preserved. No live application calls were made.

Unresolved candidates retained deliberately:
- Root contract/extraction JSON files, including build-contract, created-contract, custship-update, freight-contract and Product Code extracts: contract evidence, some explicitly cited by coverage.md; absence of imports does not make these disposable.
- app-metadata.local.json and event-chain.local.json: investigation evidence; no established supersession.
- kinetic-browser.local.json, quickship-browser.local.json, native-plan.local.json and preparation.local.json: literal or command-line consumers remain in scripts/documentation. Generic discover-shipment.cjs accepts a config path; no config migrated without demonstrated obsolescence.
- playwright-report, test-results and captures: historical execution evidence; no report deduplication attempted.
- tests/customer-shipment/create-shipment.spec.ts: completeness-gated cases retained in discovery; no demo requirement to hide them. tests/local/create-shipment-contracts.spec.ts consumes the implementation.
- BASELINE.md: historical failure baseline, retained as evidence rather than rewritten as current status.

Inspection covered package scripts, Playwright project discovery, tsconfig, baseClient, imports/requires, literal reads, process.argv consumers, README/BASELINE, scenario coverage, VAT README and retained run-evidence narratives. Private configuration values were not copied into this index.
