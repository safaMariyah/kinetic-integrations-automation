# Automation repository redesign plan and implementation record

Updated: 24 November 2026. This is the authoritative redesign status; source-case
coverage and original run evidence remain authoritative for business acceptance.
No architecture guarantees that ERP, carrier, environment or credential changes
cannot cause failures. The goal is controlled changes and diagnosable failures.

## Original goals and current status

| Goal | Status | Evidence / remaining scope |
| --- | --- | --- |
| Playwright fixtures | Implemented for connection lifecycle | All four implemented scenario families use fixtures; incomplete Create Shipment remains a preflight barrier. Additional data fixtures are pending. |
| Modular workflows | Partial | Configuration, sessions, responses, completion validation and order preparation extracted; order preparation remains large. |
| Organized files/tooling | Partial | Miscellaneous folder, maintained CLI, ignored runtime/scratch policy implemented; historical scripts still need inventory/consolidation. |
| Efficient support storage | Partial | Generic dataset ownership reduced; QuickShip modules and scenario resources still need a consistent domain layout and retention policy. |
| Human-readable comments/logs/errors | Partial | Boundary comments, operation/checkpoint failures and HTTP guidance added; generic field mismatches and structured event reporting remain. |
| Safe additive generation | Partial | Generation instructions, fixture rules, basic architecture checks and offline CI added; owner review and complete impact analysis remain. |
| Environment portability | Partial | Explicit environment-file selection and runtime artifact configuration added; capability profiles and second-machine/live proof remain. |

## Implemented changes, in order

1. Moved miscellaneous master-pack spec from tests/customer-shipment into
   tests/miscellaneous-shipment. Updated Playwright discovery and scenario README.
2. Renewed an existing QuickShip session during functional diagnosis. Fresh live
   blind-shipping variants and VAT passed before broad architecture migration.
   This was authentication repair, not proof of a business-code regression cause.
3. Set explicit Count/EA stock/purchasing/selling units for new miscellaneous M1,
   reusing the existing part contract. Its next live attempt passed preparation
   and picking but failed persisted BOX packaging verification. M1 and order 8157
   were retained; do not blindly rerun the fixed-identity scenario.
4. Added tests/fixtures.ts: validated ERP settings, test-scoped ERP client,
   opt-in scoped QuickShip reader, scenario timing/checkpoint attachment and shared
   part-extras reader. Contexts are disposed even on assertion failure. Fixtures
   do not create or freight business records.
5. Migrated blind shipping, VAT, Product Code and miscellaneous lifecycle code
   to fixtures. Preserved business steps, source requirements and assertions.
6. Split src/api/baseClient.ts responsibilities: src/config/epicor.ts validates
   settings; src/api/epicorSession.ts creates authenticated contexts; BaseClient
   retains HTTP transport. Compatibility exports preserve diagnostic callers.
7. Extracted src/flows/orderPreparation.ts for part/stock/order/allocation/picking.
   Added shipmentTypes.ts for existing shared input/progress/step contracts.
   Miscellaneous preparation now calls this capability without executing customer
   shipment creation. Public wrappers preserve existing result shapes.
8. Added src/config/values.ts for required and numeric environment values; migrated
   repeated live-spec scalar validation. Source-required values stay in specs.
9. Moved queue absence verification to fulfillmentReaders.ts. Kept the former
   productCodeReaders.ts export compatible with existing consumers.
10. Added src/config/artifacts.ts: validate confirmed outgoing directory against
    runtime configuration and check accessibility before mutation. VAT/Product
    Code no longer read discovery.local.json. Copied existing confirmation into
    ignored .runtime/config.json without deleting/modifying discovery evidence.
    RUNTIME_CONFIG_FILE overrides the runtime file. Added .runtime/ ignore rule.
11. Added workflow boundary failures identifying the business operation, retained
    stage and original cause. Existing finally attachments retain run identities.
12. Added maintained tools/cli.cjs entry point and tools/doctor.ts. Doctor checks
    settings and file access only; it does not validate authentication or ERP
    master data and makes no network calls. Historical scripts remain available.
13. Added tools/architecture.ts and check:architecture; npm run check now runs it
    after TypeScript. Current basic checks reject src-to-tests imports, direct
    context creation/discovery reads in live specs and selected browser patterns.
    These are limited text checks, not a complete AST dependency policy.
14. Added .github/workflows/offline.yml: Node 22, npm ci, typecheck/boundary checks,
    offline regression tests on Windows/Linux and failure-report retention for
    14 days. Hosted execution and branch protection remain unverified/unconfigured.
15. Updated AGENTS.md with generation, lifecycle, module ownership, runtime storage,
    temporary diagnostic and verification rules. Updated README throughout.
16. Extracted src/api/response.ts: HTTP/JSON handling and existing sanitized Epicor
    diagnostics. Shared API/workflow callers import it directly; datasets retains
    compatibility exports. Added guidance for 401/403/404/409/429 and uncertain
    writes. No automatic mutation retries were added.
17. Extracted shipment UpdateMaster completion validation into shipmentSave.ts;
    retained compatibility exports. Removed repeated VAT/Product Code extras reads.
18. Added src/config/environment.ts, used by Playwright and maintained CLI.
    TEST_ENV_FILE selects a file; default .env is optional; a missing explicitly
    selected file fails. Existing process variables override file values. Added
    focused offline coverage for selection, precedence and missing-file failure.
19. Added this consolidated plan and linked it from README, replacing stale
    intermediate migration status with this implementation record.

## Current verification

| Gate | Status | Limit |
| --- | --- | --- |
| npm run check | PASS | TypeScript and current basic architecture rules |
| npm run test:local | PASS, 44 tests | Offline behavior only |
| npm run doctor | PASS on current machine | Configuration/presence/access; no network |
| Hosted Windows/Linux CI | UNVERIFIED | Workflow added; no hosted execution observed |
| Blind shipping after initial fixture pilot | PASS, packs 345/346, transactions 573/574 | Later extraction/config changes have not been live verified |
| Earlier fresh VAT | PASS, pack 341, transaction 569 | Predates subsequent architecture migration |
| Product Code | FAIL | ChangeXPartNum returned a different internal part; cause/remedy still requires contract investigation |
| Miscellaneous/master pack | FAIL | Persisted packaging differs from BOX; retained M1/order 8157 require state inspection before recovery |
| Two-stage Create Shipment | INCOMPLETE | Existing completeness barrier and source coverage remain; not implemented by blind shipping |

Earlier fresh blind-shipping passes also retained packs 339/340 and transactions
567/568. Original failures and passes remain separate under captures/runs and
resources/customer-shipment/run-evidence. Architecture checks do not replace live
persisted business or correlated integration verification. No live requests were
made during the environment-selection step documented here.

## Environment selection

PowerShell:

```powershell
$env:TEST_ENV_FILE = '.runtime/qa.env'
$env:RUNTIME_CONFIG_FILE = '.runtime/qa.runtime.json'
npm.cmd run doctor
npm.cmd run check
npm.cmd run test:local
```

Use an ignored file for machine settings/secrets or inject environment variables
in CI. Configure approved certificate trust before starting Node. Do not copy a
machine's artifact approval to an unverified directory. Existing legacy scripts
may still load .env directly; TEST_ENV_FILE support currently covers Playwright
and tools/cli.cjs only. Selection does not establish environment compatibility.

## Remaining work, in recommended order

1. Repair Product Code selection using applicable contracts and retained identities.
   Preserve required customer code/revision semantics; do not infer earlier causes
   from uniqueness approval or silently change source values.
2. Diagnose miscellaneous packaging with current authoritative reads and documented
   default/change/save contracts. Build bounded recovery for retained records;
   confirm before any uncertain write. Complete master-pack live verification.
3. Resolve two-stage Create Shipment contracts, transitions and outgoing artifact
   semantics; implement every source requirement before lifting its barrier.
4. Split orderPreparation into stock, sales-order and fulfillment capabilities
   with explicit typed results. Narrow shared scenario inputs; remove unrelated
   optional fields and remaining compatibility-shaped empty result objects.
5. Extract shipment/freight capability boundaries and move remaining QuickShip
   readers/artifacts under one integration owner. Choose domain folders when
   migration is coherent; do not create empty abstraction scaffolding.
6. Add structured safe operation events, precise assertion context and approved
   safe expected/actual fields. Keep raw auth, addresses and payloads private.
   Fixed source identities must fail clearly; alternatives are permitted only
   when source semantics allow them. No interactive prompts inside CI tests.
7. Inventory every legacy script and private config by consumers, effects and
   supported purpose. Migrate maintained commands into tools, then deprecate
   duplicates. Preserve historical captures and original failures. No bulk delete.
8. Define non-secret environment/capability profiles (allocation, ERP version,
   company/site/workstation, artifact source). Keep secrets and machine paths
   separate. Prove onboarding on another machine/environment; do not treat a
   changed warehouse variable as a validated allocation profile.
9. Add data ownership/identity strategy and cross-process locks for shared master
   updates. Maintain fixed literals when required; unique identities otherwise.
   Define explicit cleanup/recovery contracts; disposal remains unrelated to ERP
   rollback. Serial workers do not prevent concurrent independent CI jobs.
10. Expand readiness with supported read-only target/master/capability checks and
    clear supported commands. Authentication renewal must finish before mutations.
11. Strengthen AST/import boundaries, review ownership and scenario generation
    templates. Add branch-required checks when repository hosting is configured.
    New cases should be additive; shared fixes require consumer impact review.
12. Maintain a baseline manifest linking commit, environment profile, scenario,
    coverage and immutable run evidence. Perform applicable authorized live
    regression after shared changes; preserve all prior results.
13. Configure retention for new reports/private diagnostics and preserve historical
    acceptance evidence. Keep only sanitized selected contracts in tracked resources.
14. Remove compatibility exports only after all internal/external tool consumers
    have migrated. Review formatting/comments and obsolete POC assertions then.

## Completion criteria

A fresh checkout has one documented setup path; supported environments are explicit.
New scenarios compose reviewed capabilities and retain source-step coverage.
Framework changes pass offline and applicable live regression. Failures identify
operation, safe identities, observed/expected outcome, checkpoint and recovery
constraints. All scoped scenarios have fresh business/integration evidence; an
incomplete barrier or passing mocks never counts as end-to-end acceptance.
