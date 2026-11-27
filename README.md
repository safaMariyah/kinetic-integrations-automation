# Kinetic API automation POC

API-only Playwright automation. Blind shipping, Product Code and Create Shipment implementations are retained. See resources/customer-shipment/coverage.md for source-step coverage, historical outcomes and unresolved requirements. Create Shipment has separate checked-then-freight and unchecked-direct automation; blind shipping is a different scenario.

Node 22+, installed dependencies. Credentials stay in ignored .env; use .env.example. Kinetic and QuickShip authentication remain separate. Configure NODE_EXTRA_CA_CERTS with your approved PEM in the selected environment file or process environment. CLI commands restart Node when needed to load it at startup. With an explicit CA on Windows, the runner disables system-CA mode: on this target, that mode rejects the approved self-signed ERP certificate even when it is loaded. Certificate verification and hostname checks remain enabled.

```powershell
npm.cmd run check
npm.cmd run test:local
npm.cmd run list:live
node --test tools/discovery/test-discover-shipment.cjs
# MUTATES ERP; invokes freight/carrier services; requires exact target/scope authorization:
npm.cmd run test:live -- tests/customer-shipment/blind-shipping.spec.ts --grep "customer=false; shipment-level blindShipping=true"
# Other live scenarios (same authorization and mutation warning):
npm.cmd run test:live -- tests/customer-shipment/customer-product-code.spec.ts
npm.cmd run test:live -- tests/customer-shipment/create-shipment.spec.ts
# View a retained report; replace RUN with the directory printed by Playwright:
npx.cmd --no-install playwright show-report captures/runs/RUN/html
```

Every invocation gets a unique captures/runs/<timestamp>-<uuid> directory with html, results.xml and test-results. Historical reports remain untouched. Serial execution, zero retries. Review retained IDs before any rerun; disposal does not undo ERP/carrier effects.

```text
src/
  api/        baseClient and service operations
  flows/      shipment, Create Shipment, Product Code, fulfillment and preparation
  support/    datasets, workflow checkpoints, locks and run evidence
  integrations/quickship/  artifact contracts, independent reader and session renewal
tools/        supported CLI and separate browser discovery
scripts/      interactive login, explicit preparation and compatibility wrappers
archive/      historical investigations, not supported execution
 tests/       customer-shipment live scenarios; local offline fixtures
resources/customer-shipment/  prose, coverage, contract evidence, run-evidence
.agents/skills/epicor-api-poc-mentor/  installed skill and catalog tools
```

Discovery entry point: node tools/discovery/discover-shipment.cjs <config.local.json>. Inspection and action modes are distinct; action mode requires explicit approval in its config and can mutate ERP. See the installed skill references/contract-capture.md. The local fixture command above uses localhost only. Catalog discovery uses the skill scripts/query_catalog.py; pass --catalog and --spec-dir from ignored discovery.local.json explicitly (not automatically loaded).

Preparation is separate: node scripts/prepare-shipment.cjs .runtime/inputs/preparation.local.json --authorized-prepare. This MUTATES ERP (part, stock, order, allocation and shipment preparation); it is not a readiness check. Use npm run doctor for offline setup checks and npm run readiness:quickship for explicitly scoped live session reads. Historical environment probes are archived and are not current readiness commands. QuickShip record-opening browser discovery may invoke automatic server writes; prefer the shared API reader.

Private investigation and preparation inputs belong in ignored `.runtime/inputs/`, environment settings in `.env` (or `TEST_ENV_FILE`), authentication in `.auth`, and artifact provenance in `.runtime/config.json`. Machine catalog/spec paths remain in root `discovery.local.json`. Pass discovery/preparation input paths explicitly; embedded paths still resolve from the repository working directory. Historical scripts in `archive/` may reference former root locations and are not supported commands. Never commit private inputs or raw captures. The local migration inventory retains original paths and content hashes under `.runtime/`.

QuickShip readers: scope must follow the correlated persisted ERP pack/company/site, actual outgoing workstation/registration, actual carrier response, and fresh company/facility/workstation relationships. Shipment-level zero companyId is an observed non-authoritative projection; session readiness or accepting zero alone cannot establish shipment scope. The shared reader enforces this chain for VAT and Product Code. See resources/customer-shipment/coverage.md, QuickShip scope correction (2026-11-19), and tests/local/quickship-scope.spec.ts. Original run outcomes remain immutable; corrected existing-record reads are separate verification.


## Shared infrastructure and scenario ownership

All implemented live specs import `test` from `tests/fixtures.ts`. The `epicor`
fixture owns the authenticated ERP context and always disposes it. Request
`quickShip` only for scenarios requiring independent QuickShip reads; it checks
session scope before the test body and disposes the reader on failure. Fixtures
must not create or freight business records. Keep business steps and acceptance
assertions visible in the scenario.

Configuration validation lives in `src/config/epicor.ts`; authenticated context
creation lives in `src/api/epicorSession.ts`; `src/api/baseClient.ts` owns HTTP
transport. Existing base-client exports remain available for diagnostic tools.
Use the validated settings fixture when adding new infrastructure dependencies.
Never import secrets into scenario source or print session state.

The [original redesign snapshot](docs/redesign-plan.md) records the 24 November
state and predates subsequent implementation. It is historical, not current
completion status. Current capability ownership is indexed below; source coverage
and immutable run manifests establish scenario verification. Progress is reported
in chat.


Order preparation is now implemented in `src/flows/orderPreparation.ts`, with
shared scenario types in `shipmentTypes.ts`. Customer shipment composition calls
that capability before creating a pack. The miscellaneous picking entry point
calls order preparation directly, so it cannot reach customer-shipment creation.
The public wrappers remain compatible with existing callers. Environment scalar
validation is shared in `src/config/values.ts`; required source-case identities
and scenario quantities remain visible in specs.


Runtime artifact configuration for VAT and Product Code lives in ignored
`.runtime/config.json` (override with `RUNTIME_CONFIG_FILE`). Its JSON contains
`artifactProvenance: "user-confirmed"` and `artifactDirectory` equal to the
actual outgoing directory in `QUICKSHIP_REQUEST_DIRECTORY`. Existing local
confirmation was copied during migration without changing the discovery file.
On another machine, confirm that directory before setting provenance. Catalog
and original-spec paths continue to belong in `discovery.local.json`.

Shared queue verification now belongs to `fulfillmentReaders.ts`;
`productCodeReaders.ts` remains a compatibility export. Workflow failures name
the business step and retained checkpoint while preserving the original cause.


Maintained developer commands:

- `npm run doctor`: configuration and local file access only; no network calls.
- `npm run readiness:connection`: read-only native TLS comparison and ERP warehouse read in the same Playwright worker/fixtures as live scenarios. Run this in the terminal used for the demonstration. Reports loaded CA count, certificate hashes and sanitized certificate failure codes; creates no business records. Every scenario's ERP fixture also checks the configured warehouse/company/site before yielding its client for business writes. A readiness pass does not prove scenario or carrier outcomes.
- `node tools/cli.cjs erp-readiness "--target=<EPICOR_BASE_URL>|<EPICOR_COMPANY>|<POC_PLANT>" --family=customer`: explicitly scoped live reads of customer, warehouse/site, active bins, employee and packaging prerequisites. Use `--family=miscellaneous` for its fixed ECD/EDA-A, BOX and source-bin requirements.
- `npm run check`: TypeScript plus enforced module boundaries.
- `npm run test:local`: offline workflow/contract regression suite.
- `npm run list:live`: discovery only; no ERP requests.

The offline CI workflow runs on Windows and Linux with Node 22 and locked npm
installation. CI portability remains unverified until the hosted jobs run.
The doctor does not prove credentials are accepted, saved sessions are current,
master prerequisites exist, or a scenario can execute successfully.

ERP readiness requires approved certificate trust before Node starts and makes no
business writes. Customer lookup uses the existing read-only `GetByCustID` POST;
the remaining readers use `GetByID` GET. It never initializes datasets, allocates,
adjusts stock, creates records or invokes freight. A pass describes current common
prerequisites only; scenario-specific preflights, QuickShip readiness and actual
integration/business verification remain required. Each invocation retains a
separate sanitized `erp-readiness.json` with its outcome and failed check stage.

Create temporary diagnostics in `.runtime/scratch/`. Promote a diagnostic into
`tools/` only when it has an ongoing supported use; reuse configuration and API
modules. Historical scripts remain available until their callers and contracts
have been migrated. Adding a scenario must preserve existing source coverage,
assertions and data ownership, and use fixtures for connection lifetime.


HTTP status/JSON handling and sanitized server diagnostics live in
`src/api/response.ts`. Generic dataset utilities retain compatibility exports;
new API/workflow code imports response handling directly. Shipment UpdateMaster
completion validation lives in `src/api/shipmentSave.ts`. This keeps ERP shipment
completion flags out of generic dataset transformations. Common HTTP errors now
include operator guidance; no error path automatically retries business writes.


Environment selection: set `TEST_ENV_FILE` before invoking Playwright or the
maintained CLI. It defaults to optional `.env`; an explicitly missing selection
fails. Existing process environment values win. Use `RUNTIME_CONFIG_FILE` for
the matching artifact-provenance file. See the redesign plan for commands and
legacy-script limitations.


## New engineer setup for the supported EPIC06 target

This is the supported setup path; onboarding on another machine has not yet been
demonstrated. A profile declares the captured allocation capability, not that
credentials, master data, permissions or installed ERP builds have been verified.

1. Use Node 22+ and run `npm ci` from the repository root.
2. Copy `.env.example` to ignored `.env`. Supply ERP credentials/API key, active
   movement employee, and the QuickShip registration/company settings privately.
3. Set `TEST_TARGET_PROFILE=config/profiles/epic06.json` to validate the declared
   EPIC06/MfgSys/CHI target. Existing process variables take precedence over the
   selected environment file; file values take precedence over profile defaults.
   Conflicting target/company/site/source warehouse values fail before ERP access.
4. Provision approved certificate trust and set NODE_EXTRA_CA_CERTS before Node
   starts. Provision the saved QuickShip session at QUICKSHIP_STORAGE_STATE.
   `scripts/refresh-quickship-session.cjs` is the existing interactive login tool;
   inspect its scope first. It still loads `.env` directly, so alternate selected
   environment files are not supported by that legacy authentication command.
5. Make the real outgoing QuickShip artifact directory accessible on this machine.
   After confirming its provenance, create ignored `.runtime/config.json` with
   `{"artifactProvenance":"user-confirmed","artifactDirectory":"<actual directory>"}`.
   Set QUICKSHIP_REQUEST_DIRECTORY to that same directory. Do not copy another
   machine's approval to an unverified location.
6. Run `npm run doctor`, `npm run check`, `npm run test:local` and `npm run list:live`.
   These do not establish live authentication or business readiness. The existing
   master/customer/allocation requirements remain applicable; the generated
   miscellaneous part must be absent for each fresh case. No automatic ERP setup or cleanup is performed.
7. Only with applicable target/scope authorization, use `npm run test:live -- <spec>`.
   Historical live evidence is not authorization for another person's environment.

TEST_ENV_FILE selects an alternate private environment file. TEST_TARGET_PROFILE
selects a target declaration. RUNTIME_CONFIG_FILE selects private artifact
configuration. Only `epic06-mfgsys-chi` allocation is implemented. Supporting a
different environment requires validated contracts/master data and capability
implementation; editing the profile name does not provide that support.

Each new Playwright report includes manifest.json with selected target profile,
source hashes, commit/dirty state and outcomes. Private environment/runtime files
are excluded. A passing manifest records execution evidence, not a complete
snapshot of external ERP/carrier state or private configuration.

Inline checkpoint attachments also record a content hash and a narrow recovery-ID
summary in the manifest. Only approved part/order/pack/queue/transaction identifiers
are projected; arbitrary payloads, VAT before-images, credentials and addresses
are excluded. The original attachment remains in the private report. Recovery
still requires current authoritative reads and the original scenario preconditions.


## Capability index for adding scenarios

Start here, then inspect the function and its callers. The index describes code
boundaries, not authorization or proof of live compatibility. Typed preparation
handoffs have retained fresh live passes. Later tooling and evidence-only changes
have separate offline/hosted verification; consult the exact run manifests rather
than treating an older pass as verification of every later revision.

| Need | Existing function | Input / result | Preconditions and limits |
| --- | --- | --- | --- |
| Stock part + initial inventory | `prepareScenarioStock` in [stockPreparation.ts](src/flows/stockPreparation.ts) | StockInput -> PreparedStock | Simple untracked EA stock; new unique part or explicitly prepared part; zero initial source stock required |
| Order, line and release | `prepareScenarioOrder` in [salesOrderPreparation.ts](src/flows/salesOrderPreparation.ts) | SalesOrderInput + PreparedStock -> PreparedOrder | Same company/site; complete defaults/change/save datasets retained; optional owned customer mapping requires explicit revision semantics |
| Allocation/picking/movement | `prepareScenarioPicking` in [pickingPreparation.ts](src/flows/pickingPreparation.ts) | PickingInput + PreparedOrder -> PickedOrder | Captured MfgSys/CHI allocation only; exact queue, bins, quantities and persisted stock checked |
| Combined preparation | `prepareOrderForShipping` in [orderPreparation.ts](src/flows/orderPreparation.ts) | PreparationInput -> PickedOrder | Composes the above; creates no shipment/carrier record |
| Customer pack header/line | `createOpenCustomerShipment` in [shipmentPreparation.ts](src/flows/shipmentPreparation.ts) | ShipmentPreparationInput + PickedOrder -> PreparedShipment | Scope, quantity and destination must match picked stock; returns independently read OPEN dataset |
| Close + freight + ERP write-back | `freightCustomerShipment` in [shipmentFreight.ts](src/flows/shipmentFreight.ts) | ShipmentFreightInput + PreparedShipment -> FreightedShipment | Fresh OPEN pack/line read; standard SUCCESS branch only; carrier effects retained; no mutation retries |
| Complete standard customer path | `customerShipment` in [customerShipment.ts](src/flows/customerShipment.ts) | ScenarioInput -> legacy-compatible result | Convenience composition; integration artifact assertions remain in specs |
| VAT master update | `saveCustomerVat` in [customerVat.ts](src/flows/customerVat.ts) | VatInput -> persisted VAT identities/values | Approved EPIC06/ECD/EDA-A source values; updates shared masters; no automatic restoration |
| Miscellaneous/master completion | `completeMiscellaneousMasterPack` in [miscellaneousMasterPack.ts](src/flows/miscellaneousMasterPack.ts) | Exact expected scope + retained progress | Verified OPEN M1/7EA/BOX/F92 constituent, unassigned; recovery is distinct from full fresh execution |
| Actual integration request/response | `waitForQuickShip`, `waitForQuickShipResponse` in [artifacts.ts](src/integrations/quickship/artifacts.ts) | Expected current-run identities + start time | Confirmed accessible artifact source; strict correlation; does not create artifacts |
| Independent QuickShip scope/read | `createQuickShipReader` in [reader.ts](src/integrations/quickship/reader.ts) | Configured session + correlated ERP/artifact evidence | Prefer quickShip fixture; requires scope evidence, not just a matching projection field |

New stock -> order -> picking -> shipment cases should normally compose
`prepareOrderForShipping` and `createOpenCustomerShipment`. Add freight only if
required, then assert actual outgoing artifacts and independent integration state.
New code should describe source-specific inputs, step mapping and acceptance
assertions. Add a new business operation only when the existing capabilities do
not implement the required transition. Do not copy their API sequences into specs.

Generation/review checklist:

1. Read AGENTS.md and the installed Epicor skill; normalize actual source steps.
2. Select capabilities from this index and inspect current implementations/callers.
3. Classify required versus illustrative identities and ownership before provisioning.
4. Import `test` from `tests/fixtures.ts`; request only needed API fixtures. Keep
   business mutations explicit. Map each substantive source result to an assertion.
5. Use typed capability results for handoffs and Progress for retained diagnostics.
   Preserve complete returned datasets and operation-specific RowMod behavior.
6. Review any shared-code change against every existing consumer. Offline checks
   and an index encourage reuse; neither detects all duplicate business logic.
7. Run offline gates. For authorized live acceptance, retain the manifest, events,
   persisted outcomes and actual correlated integration artifacts. A mock pass,
   completeness barrier or recovery pass is not a fresh full scenario pass.

The architecture check inspects imports, re-exports, literal `require()` calls,
import assignments and dynamic imports. It normalizes relative paths before
enforcing layer direction: configuration stays independent, API adapters do not
depend on workflows, and integration adapters do not depend on scenarios.
Live specs use the shared fixture and cannot import discovery tools or browser
drivers. Named Playwright imports keep these dependencies reviewable. This is a
maintainability check, not a security sandbox or a detector for duplicated logic.

Two-stage Create Shipment is implemented in its own spec with an observed
create-only contract, before-image-aware save and transition ledger. Its exact
creation Warning is not a general warning-acceptance policy. See source coverage
for live evidence and the limits of subsequent evidence-only changes.


Existing QuickShip sessions can now be renewed using the maintained command:

```text
node tools/cli.cjs quickship-refresh "--target=<QUICKSHIP_BASE_URL>|<EPICOR_COMPANY>|<QUICKSHIP_COMPANY_ID>"
```

This makes one authentication refresh POST using the configured saved session,
verifies rotated scope before replacing the file, then verifies a fresh reader
from the exact final path. It uses TEST_ENV_FILE/TEST_TARGET_PROFILE, retains
sanitized authentication evidence, and takes the same target lock as live runs.
It never opens shipments or refreshes automatically during business execution.
If refresh is rejected, provision an interactive login through the existing
scoped login script. The historical captures refresh script is not a supported
entry point; retained investigation evidence has not been deleted.

For target arguments containing `|`, use the direct Node commands above in
PowerShell. This avoids npm.cmd passing the argument through another shell that
can reinterpret the separators as pipelines. The npm aliases remain available
where shell quoting preserves the complete target argument.

## Data ownership and evidence retention

Fresh scenarios own their generated parts, orders and packs. Product Code uses
the approved unique customer code; miscellaneous uses the approved unique part
while preserving description M1 and its source quantities. VAT updates shared
customer/ship-to records and retains their prior state privately. A passing test
does not authorize deleting ERP records, reversing carrier transactions or
restoring shared masters. Recovery uses retained exact identities and current
authoritative reads; never replay an uncertain write automatically.

Use the maintained live runner and one shared `LIVE_LOCK_DIRECTORY` for every
process targeting the same company. Separate machines require a mutually
accessible lock directory or CI concurrency controls; local filesystem locks
cannot coordinate independent hosts. Direct Playwright commands bypass that
runner's lock.

| Material | Location | Retention |
| --- | --- | --- |
| Source coverage and selected sanitized contracts | `resources/` | Review with code; preserve original source steps and historical outcomes |
| Live runs, failed writes, recovery and acceptance evidence | `captures/runs/`, private stage artifacts | Preserve; no automatic local deletion |
| Offline reports | `captures/runs/` | Disposable after review; hosted failure artifacts expire after 14 days |
| Local investigation inputs and scratch work | `.runtime/inputs/`, `.runtime/scratch/` | Private; review consumers before removal |
| Saved sessions and environment settings | `.auth/`, selected environment file | Private; replace through supported authentication/configuration procedures |

New manifests record coverage/specification hashes separately from execution
source hashes and detect changes during the run. Their retention classification
helps distinguish offline diagnostics from live evidence. Neither a hash nor a
passing run guarantees future ERP, carrier or configuration behavior. No local
retention job deletes historical evidence.


## Maintained commands versus historical investigations

Generic browser discovery and its localhost-only lifecycle test live together in
`tools/discovery/`. It remains outside the API regression suite. The preparation
runner now uses selected environment/profile settings and the same target lock
as live tests; it still requires its explicit preparation authorization argument.

18 one-off probes were moved byte-for-byte into
`archive/diagnostics-2026-11-26/` as historical text snapshots. Its inventory records
original paths and hashes. Retained captures and source-case evidence were not
moved. Their old script references describe history, not current setup commands.
The two scripts forwarding old readiness commands remain compatibility wrappers.
