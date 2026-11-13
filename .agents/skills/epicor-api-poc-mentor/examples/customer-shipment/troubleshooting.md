# Failure diagnosis and minimal supported fix

| Failure | What to inspect / next supported correction |
| --- | --- |
| Compilation | Exact diagnostic and nearby imports/types/braces; smallest source fix. No API execution follows from a typecheck. |
| Missing config | Loader file/cwd, name presence and parsed type before client/mutation; never print values. Nested child .env does not inherit parent; .env.example isn't loaded. Don't overwrite populated files. |
| Transport/TLS/DNS | No reliable HTTP result; mutation may have committed. Safe status/operation diagnostics, approved trust and retained IDs; no blind replay. |
| HTTP | Response exists; preserve sanitized method/path/status and relevant business detail. Don't invent negative status or refactor unrelated clients. |
| Business warning/incomplete save | HTTP200/false error flags aren't completion. Inspect outputs and fresh saved state; never disable validation or assume rollback. |
| Wrong MaterialQueue method | Params body belongs to GetRowsCustomParams, not GetRowsCustom expecting delimitedFilterString. Fix exact URL before inventing fields. |
| Hidden queue | Inspect actual filters/operational company-employee context; don't infer absent/deleted/processed from UI or blank selected employee. |
| Unsaved line rejected by helper | PackLine0 was captured legitimate for GetQtyInfo; positive-only client guard was not server evidence. Keep saved positive ID checks where appropriate. |
| Selling quantity0 before save | Current new-line flow populates selling value on successful save; check saved8/8, don't force it prematurely. |
| Movement work row negative | Read exact bin/context independently; reset IssueReturn OnHandQty=-8 isn't actual bin balance. |
| Freight tariff400 | EM0306 Primary Tariff ID is observed; approved specific tariff mapping/create input still needs evidence/read-back. Don't assume every error maps to one universal field. |
| Delayed/unreadable artifact | Check actual runner/server share/path, IDs and freshness. Bounded read-only polling; no refreight or latest-file shortcut. |
| JSON string inside JSON | Decode observed bounded encoding then validate object/type; don't use arbitrary recursive parsing to hide malformed output. |
| All done/user approval | Record report/approval scope; obtain attributable variant/live/pipeline evidence before promoting stage. |

Transport errors can contain Authorization/API keys; never ask for full call logs, .env or secrets. Request sanitized extracts, keep useful status/messages, test redaction with fabricated markers before claiming systematic coverage. Current support.ts hides transport exception details and whitelists attached IDs but doesn't establish a general redactor. Don't copy raw errors into reports.

After uncertain mutation keep generated IDs, last stage and any transaction; inspect authoritative reads/integration/carrier artifacts before a documented recovery. Disposal isn't deletion. Negative tests need an evidenced rejection contract plus unchanged persisted state. A missing stock row isn't automatically0. New environments require fresh context/trust/permissions rather than historical defaults.
