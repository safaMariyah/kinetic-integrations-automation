# Specification and project contract

## Normalized scenario

Copy `assets/templates/scenario-spec.json` and replace all example content. Preserve original source step IDs/text. For every substantive expected result, assign an ID in that source step's `expectations` list (`id`, `text`) and map it using assertion `source_expectation_ids`, or an open gap's `expectation_ids`. Include empty lists where no expected result exists. IDs must be unique across the scenario. Preserve compound actions/criteria rather than compressing away requirements.

Use existing top-level arrays: sources, source_steps, entities, preconditions, deviations, operations, variants, actions, assertions, coverage, gaps, validation. Keep action dependencies in topological order. Record input role as `classification`: LITERAL, EXAMPLE or DERIVED alongside type/origin/value_ref. Record mutation effects, returned dataset/identifier handoffs, verification readers and code references.

Coverage dispositions: `navigation` (empty references plus reason), `prerequisite` (precondition refs), `action` (action refs), `assertion` (assertion refs), `approved-exclusion` (approved deviation refs plus deviation_id), `gap` (gap refs). Repeat a step's coverage row when it has multiple roles. Every source step needs coverage; all substantive expected results need assertions, open gaps or an explicitly approved step exclusion. An exclusion never establishes a passing original criterion.

`operations.status`: supported, assumed or missing. Assumed/missing operations require an open gap. `implementation.status`: planned, implemented or blocked. Only supported operations may back implemented actions. An implemented scenario cannot have blocked actions or open action/operation/assertion/acceptance gaps. Open runtime prerequisite gaps must be checked before mutation; they do not prevent implementing the test.

Stage labels (`mapped`, `implemented`, `typechecked`, `locally-tested`, `live-verified`, `integration-verified`, `pipeline-verified`) are reporting summaries, not mandatory execution sequences. Each evidence-bearing label needs its own per-variant passing validation record. A live run does not require a fictional mock or compiler result. Keep the full independent gate table: each record includes variant_id, type, result (PASS/FAIL/UNVERIFIED/N/A), source_ref, command and reason when applicable. Never use a stage label to hide missing checks.

Run `python scripts/validate_scenario.py <scenario.json>`. Structural validity does not prove source completeness, contract applicability, correct sequence, authorization or execution. Review against original prose in addition to running the validator.

## Minimal project when no baseline exists

Use this small structure only when no supplied architecture can be reused:

```text
package.json
playwright.config.ts
tsconfig.json
.env.example
src/config.ts
src/api/client.ts
src/api/<service>.ts
src/data/<scenario>.ts
tests/api/<scenario>.spec.ts
```

Use Node.js, TypeScript and `@playwright/test` (import APIRequestContext types from that package; a separate playwright-core dependency is unnecessary); inspect available compatible versions rather than inventing pinned standards. Add helpers only for reused responsibilities. Define project scripts for actual checks you implement, not assumed lint/unit projects. Configure serial live execution and retries zero. Keep live selection separate from offline tests. Tests retain acceptance assertions; service functions handle exact contracts; the client handles transport/auth/lifecycle and sanitized errors.

Explicit required runtime settings: API root, company, target/environment identity, authorization/auth mechanism and secret variable names, applicable site/workstation/master data, timeout budgets and business timezone. Integration scenarios additionally require an actual artifact reader/access route. None has a tenant default. Use environment variables or an existing approved loader; Node does not load `.env` merely because the file exists. Validate missing/blank fields without printing secrets. Do not create a browser project.

Inspect prerequisites and completeness before any write. Keep APIRequestContext ownership/disposal explicit; disable automatic mutation retries/redirects. Persist safe run IDs and transitions for recovery. Supply exact shell-appropriate install/check/run commands only for the generated files and supported scope. No baseline means no claim of preexisting helpers or successful live behavior.
