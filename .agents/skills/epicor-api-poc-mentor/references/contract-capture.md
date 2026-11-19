# Browser contract discovery

Work toward a resolved capability/contract or consolidated blocker, not one screen or command per turn. Within existing authorization, autonomously handle routine navigation, spec searches/extraction, DOM/network inspection, selector adaptation, driver repair and offline checks. Reuse saved sessions/evidence; inspect frames, tabs, menus and accessible controls yourself. After repeated uninformative attempts inspect state and change strategy. Combine browser findings with focused specs; startup traffic alone is not shipment-contract discovery.

Keep reusable procedures in the skill, scenario facts in project evidence and machine settings/authentication private. Improve guidance for evidenced transferable gaps, not incidental UI events. Ask only for inaccessible information, acceptance-critical decisions or effects outside authorization; batch questions and continue independent work. Skill edits cannot expand authorization or promote unverified observations into contracts.

Use only when remaining contract/sequence gaps cannot be resolved from documentation and inspected code. This is separate contract discovery; generated regression tests remain API-only. Prefer agent-operated discovery when a compatible browser tool or local Playwright runtime, reachable application and authorized authenticated session are available. Do not assume browser access, intranet reachability or authentication from the existence of Node.js alone. Performing UI actions may mutate ERP; capture does not grant authorization. Scope the session to approved actions.

## Concrete tool choice and execution plan

Default to **Playwright for Node.js**, importing `chromium` from the project's installed `@playwright/test`. Execute a focused TypeScript discovery script with the project's existing runner (normally `npx tsx scripts/discover-<capability>.ts`) through the agent's shell tool. This is the chosen implementation, not a requirement that the user manually inspect DevTools or install a particular MCP server. If a browser connector is already exposed and supports navigation plus request/response inspection, it may be used instead; never assume a Playwright MCP/browser tool exists.

1. Inspect package scripts/dependencies and available browser tools; check target reachability from the actual execution host. If dependencies are absent, provision them only inside the authorized discovery project using its package manager and applicable installation permissions; install Chromium using the local Playwright CLI. Do not use `npx` to silently fetch an unrelated package/version.
2. Launch a dedicated Chromium context using `chromium.launch()` and `browser.newContext()`, or a dedicated persistent profile when required. Reuse locally available authorized storage state; keep it outside deliverables/version control. Use a headed session for user login if needed and supported. Do not assume access to the user's desktop Edge/Chrome session or copy its profile. Attach to an existing browser via `connectOverCDP` only when an explicitly supplied, authorized debugging endpoint is available; never expose a remote-debugging port automatically.
3. Attach context request/response/requestfailed listeners before navigation. Use `request.method()`, `request.url()`, `request.postData()`, `response.status()`, and bounded content-type-aware response extraction; sanitize header/body values before persistence. Track pending response handlers and await them at the capture boundary. Record network failures and truncated/non-JSON responses explicitly. Restrict collection to approved origins and relevant API paths; observe naturally occurring writes without replaying them.
4. Navigate to the configured application URL using `page.goto()`. Inspect the DOM or accessible roles, then use evidenced locators such as `getByRole()`/`getByLabel()` to perform the scoped discovery steps. Do not guess selectors or pack IDs. Use targeted response waits around known actions rather than fixed sleeps or blanket network-idle assumptions. Capture automatic requests as well as action-triggered requests; distinguish correlation from proven causation.
5. Save minimized request/response evidence and exact identifier handoffs, resolve missing contracts, then implement regression tests separately using only `APIRequestContext`. Assess completeness before mutation-based discovery or test-data creation. A browser observation proves only its observed branch, not every scenario.
6. If this host cannot reach the intranet application or provide an authenticated browser, report that exact blocker. Prefer an authorized agent/runtime on the user's company network for the same discovery script. Use a sanitized HAR or focused manual capture only as a fallback; a skill cannot create connectivity or authentication.

The skill currently bundles an interactive capture utility, not a general autonomous UI agent. For autonomous discovery, the executing agent must create and check the focused driver above in the task project. Do not claim that adding these instructions installs Playwright, a browser connector or a reachable logged-in browser. Verify a live focused capture before claiming this capability works in the target environment.

## Autonomous discovery

Inspect available browser tools, installed Node/Playwright dependencies, target reachability and usable session before asking the user to capture requests. Use existing authorized access; never request passwords, tokens or storage-state files in chat. Ask for user login only when interactive authentication cannot be completed by the agent.

Plan the smallest unresolved contract question. Attach request/response listeners before navigation/actions; capture method, full URL, HTTP status, request body, relevant sanitized headers, response content type/body, step label and target/company/workstation context. Filter by confirmed application origin plus API pathname; exclude fonts, images and telemetry. Deduplicate identical captures without discarding changed payloads or outcomes. Save focused sanitized evidence in the task project and update coverage/contract records.

Use an available browser connector or implement focused Playwright discovery in the authorized project. The bundled capture script below is an interactive fallback, not an autonomous driver: do not claim it navigates or performs steps by itself. Browser automation for discovery does not require adding page/locator code to the delivered API tests.

Observe automatic background POST/PATCH calls too: page loads can mutate state. Assess expected effects before opening an existing record, and never replay writes merely to inspect them. Perform business mutations only within existing authorized test scope; avoid changing old shipped records, purchasing labels or unshipping without applicable authorization. Prefer documented/read-only evidence when possible.

If tooling, network access, session access or source files are unavailable, state the specific blocker once and request the smallest fallback: focused spec extraction, sanitized HAR, or request/response pair. Do not walk the user through repeated duplicate DevTools captures or guess pack IDs. Missing test data creation belongs in the automation plan when in scope; resolve its contracts and completeness before any mutations.

## Setup and command

Inspect the user's installed dependencies first. If absent, the tool requires `@playwright/test`, `tsx`, `typescript`, `@types/node` and a Playwright Chromium installation. Install only in the authorized discovery project. Do not bundle these dependencies or browser binaries in the skill.

Copy `scripts/capture-contracts.ts` into that project's `scripts/` folder, or use its absolute path with dependencies resolvable from the script. From the discovery project:

```text
npx tsx scripts/capture-contracts.ts --help
npx tsx scripts/capture-contracts.ts --scenario <unique-name> --base <app-url> --api-pattern <confirmed-path-regex> --out contracts
```

Replace placeholders before execution. Optional switches: `--storage <auth-state-file>`, `--save-auth <auth-state-file>`, `--max-body <positive-character-limit>` (default 2000000). Scenario names allow letters/digits/underscores/hyphens, beginning with a letter or digit. Missing auth state fails explicitly. Use approved TLS trust; the tool does not bypass certificate checks. The default API-path pattern `/api/` is only a starting filter, not a known application prefix.

A visible browser opens; log in manually if needed. Type a step label in the terminal before each action, press Enter, perform the action, then repeat. Wait for the last action/network activity to settle and type `done`. Step attribution uses request-start labels, which do not prove causation. Background polling may require manual filtering. Avoid closing the window; already-started response handlers drain with a bounded timeout, but requests whose responses have not started at the capture boundary are not captured.

## Outputs and limits

`contracts/<scenario>/`: `calls.json`, `contracts.json`, `contracts.md`, `fields.csv`; `contracts/registry.json` indexes observed operations. Use a unique name; output for an existing name is overwritten. The registry is a discovery index, not an authoritative contract ranking or environment-separated API catalog.

- Calls record XHR/fetch responses matching the pathname regex, excluding OPTIONS. Failed requests without a response are absent. Filter scope is pathname-based, not an origin allowlist.
- Only JSON bodies are parsed. Over-limit bodies are omitted (response text is still read into memory first). Required lists are observed field presence, not API-enforced requirements. Redaction can change inferred types; inspect original documented types.
- Value flows are heuristic repeated values, including repeated operations. Confirm exact dataset/identifier dependencies; shared constants and coincidental values may produce false matches. Large captures can make flow inference expensive.
- Key-based redaction covers sensitive structured keys and decoded query keys; URL credentials/fragments are removed from stored base URLs. It is not comprehensive content/PII redaction. Embedded strings, paths, step labels, personal data and unexpected secret key names may remain. Review **all outputs**, not only Markdown, before sharing.
- Auth-state files contain reusable secrets. Ignore them, `calls.json` and any other raw/sensitive capture output in version control; share only reviewed minimized evidence. Do not request auth-state files from the user.

Promote reviewed observations using the contract-record template with target/version/run provenance; do not let the registry override more applicable documentation. A second capture may expose optional/error branches but cannot prove required-versus-optional certainty by itself.

## Offline checks

Run `node --test scripts/test_capture_contracts.cjs` using Node 24+ for the source-stripping test harness. It tests real pure functions and a mocked capture lifecycle without launching Chromium. It does not typecheck against installed Playwright/Node typings or prove live browser capture. Check the TypeScript file in the discovery project's actual compiler and perform an authorized focused session before claiming that environment's capture works.

When shell keyword search fails, inspect captured menu metadata and rendered controls instead of retrying the same search. Distinguish menu resource names from deployed URL resolution: relative metadata URLs are not proof of their hosting base. Inspect launch configuration or a successful observed navigation before promoting a route. Save per-frame DOM inventories and relevant metadata privately. A missing accessible label requires DOM inspection, not guessed icon selectors. Prefer plain Node .cjs/.mjs with installed Playwright; tsx is optional.

For native tree navigation, inspect aria-expanded and the actual expansion control; selecting a label may leave a branch collapsed. Distinguish tree expansion from flyout activation. Exclude hidden duplicate templates before enforcing uniqueness, never pick the first ambiguous control. Attach context-wide page/frame/navigation listeners before launch. After native launch, inspect returned application definitions for bindings/event chains and correlate exact methods with local specs before considering record-level mutations. Application metadata establishes client logic, not server outcomes or automatic field resets.

Navigation can trigger writes. Assess known behavior and observed traffic before opening records. If unexpected possible writes appear, stop that discovery path and assess scope/authorization before continuing; do not replay traffic as a diagnostic.
