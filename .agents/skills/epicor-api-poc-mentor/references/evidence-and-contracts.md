# Evidence and contract records

| Evidence | Supports | Does not prove |
| --- | --- | --- |
| documented-contract | Inspected request/response schema and descriptions | Live success, method order, tenant rules or minimum payload from examples |
| implementation-inspected | Source sequence, guards, handoffs | Compilation or ERP execution |
| captured-manual | Observed request/response for recorded context | Other versions, unexercised branches or test execution |
| typecheck / mock-test | Compiler/local behavior with actual logs | Live business semantics |
| live-api-test / persisted-read | Fresh correlated run and saved state | Other variants or rollback guarantees |
| integration-artifact | This run's actual correlated output/outcome | Constructed JSON or unrelated files |
| user-report | Attributed account of a result | Independent inspection |

Record claim status separately: proposed, supported, conflicting, superseded or unconfirmed. Compare applicability, version/environment and freshness rather than imposing a universal ranking. Prose defines intended outcomes; user-approved deviations change scope explicitly. Documentation defines documented shape; captures show observed behavior, not universal required fields.

Populate `assets/templates/contract-record.json` with exact service/method/path, spec file/pointer, request types/required basis, response wrappers/tables, auth context (no secrets), datasets, identities/revisions/RowMod, warning branches, effects and independent reader. Record missing version as unknown. Retain source references actually inspected, not claims about missing artifacts. Preserve exact service casing and string/number/boolean distinctions. GET/POST names do not establish equivalent bodies or read-only effects.

For promotion: sanitize observation → match operation and context → compare existing claim → scope conflict/supersession → review branch and verification → run relevant local regression → update contract under authorized skill maintenance. Never promote generated assumptions or mocks into live evidence. Keep current run settings/IDs in the project, outside this skill.

For reusable capability findings use the existing contract record: question/capability, evidence location/provenance, environment/version and applicability limits, supported behavior, traps/conflicting observations. Retrieve these before implementing operations or assertions. Keep machine settings private and case/run facts in project evidence, not troubleshooting conversations in SKILL.md.
