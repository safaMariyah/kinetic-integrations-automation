# Product Code run 8145 diagnosis

Run: product-code-live-20261119-153525. Reports copied to ignored captures/product-code-live-20261119-153525-preserved before offline checks. HTML embedded report retained-run-identities identifies order 8145 and mapping a01b54b8-d4ee-4a51-9ef0-5ef751e12150.

Part APIPOC-0c76aa1384fe43f8aeaa85d6aeded10b; reported inventory transaction 11/19/26~18342~9613. Exact supported reads returned HTTP 200: order 8145 open, nonvoid header; no OrderDtl or OrderRel rows. Exact mapping retained for this part / EP1Testing, BaseRevisionNum and XRevisionNum blank. These reads establish current state, not the failed request contents or server transaction semantics.

Comparison: order 8139 has line/release 1, its own part APIPOC-c247c113ef1140af90a7558f8167a9a8, EP1Testing, blank revisions, price/doc price 1, quantity 100, release MfgSys/CHI. Persisted RowMod is blank in both reads; it does not reveal request RowMod. Available source-checkpoint order-stage code matches current code: default new line, explicit internal revision, ChangePartNumMaster returned ds, ChangeXPartNum returned ds, ChangeSellingQtyMaster returned ds, Update. changed() retains A for added rows and sets U otherwise. Neither failed runtime RowMod nor returned intermediate defaults/price are retained.

Cause UNRESOLVED. HTML/JUnit/error-context have the status-only exception, not the HTTP 400 body or failed dataset. No trace/network attachment is present; existing navigation captures contain no record of this unique part. Do not infer revision, duplicate customer mapping, price or RowMod as the cause. Missing evidence: original Update HTTP 400 ErrorMessage/ErrorDetails and sanitized per-stage order-line/release values (part/customer part, revisions, prices, RowMod, IDs/table handoffs). An earlier captured request/response sequence for 8139 would strengthen comparison; persisted state is not a request trace. No mutation was replayed to recover evidence.

Only diagnostic code changed: bounded sanitized business messages/error numbers now accompany HTTP failures. Message filtering deliberately withholds unknown vocabulary and all quoted values; this can omit useful detail. No raw error/dataset/authentication payload is logged. Added synthetic privacy/HTTP tests, not a fabricated live-response regression fixture. No business-sequence correction is justified by available evidence. No new data, mapping changes, Freight or live test execution.

Offline validation: npm.cmd run check PASS; npm.cmd run test:local PASS (24 tests, including two new synthetic diagnostic tests). Original five report files verified byte-for-byte against preserved copies after checks.

## Bounded customer-part ambiguity investigation

Authenticated order 8145 header confirmed ECD scope without logging customer data. CustomerPartXRefSvc/GetRows used company EPIC06, exact returned customer number, XPartNum EP1Testing and XRevisionNum blank, pageSize 25, max 4 pages. One page returned two rows and morePages=false:

| Prior order | Internal part | Mapping SysRowID |
|---|---|---|
| 8139 | APIPOC-c247c113ef1140af90a7558f8167a9a8 | 519904a1-0148-4e9d-9229-07789268051b |
| 8145 | APIPOC-0c76aa1384fe43f8aeaa85d6aeded10b | a01b54b8-d4ee-4a51-9ef0-5ef751e12150 |

Both rows have blank XRevisionNum, BaseRevisionNum and BasePartNum. No mappings were modified. Private minimized read evidence: captures/ep1testing-mapping-ambiguity.json.

Selected original contracts were retrieved with the skill query tool and configured --catalog/--spec-dir. ChangeXPartNum takes only ds and returns parameters.ds. Its description says it updates order detail when xpart changes; no duplicate-resolution rule, mapping-GUID selector or dedicated ambiguity output is documented. OrderDtl.XPartNum describes mutual defaults with PartNum, not unique resolution. CustXPrt.SysRowID is the exact mapping identity; the mapping schema notes the absence of a portable unique index. These facts do not establish server implementation/order or a duplicate-triggered failure.

Current flow supplies internal PartNum through ChangePartNumMaster before ChangeXPartNum, checks returned PartNum/XPartNum/XRevisionNum immediately afterward, and carries returned ds into ChangeSellingQtyMaster then Update. The failed run reached Update, so those implemented checks passed. No actual ChangeXPartNum response or failed Update request was retained. multipleMatch and multiSubsAvail are checked on the earlier ChangePartNumMaster response, not a documented ChangeXPartNum ambiguity flag. Mapping selection is not provably unique from code/retrieved contracts. The code/revision pair itself is demonstrably nonunique; this does not prove the internal-part-qualified selection is ambiguous or caused HTTP 400.

Source case 2 step 12 says select the customer part; its expected outgoing JSON contains literal customerProductCode EP1Testing. No source permission for a unique per-run customer code was found. Retain EP1Testing; a different code requires explicit approval, even if it would simplify isolation.

Proposed diagnostic, NOT EXECUTED: after separate authorization, use retained order 8145 and its exact existing part/mapping after fresh bounded preflight confirms header still open and no lines/releases. Create no new part, stock, mapping or header. Initialize exactly one unsaved order line; capture minimized identities, revisions, prices, RowMod, dataset table names/counts and business/ambiguity outputs after each existing change method. Attempt one Update with zero retries, preserving full returned datasets in memory. Retain sanitized HTTP error details. Whether save succeeds or fails, independently read order 8145 once to establish persisted line/release state, then stop. No allocation, movement, shipment or Freight. This is a separately authorized new diagnostic attempt, never an automatic retry. Review a concrete bounded runner before approval; it has not been implemented or invoked in this investigation.

Manual tester question: In EPIC06/ECD, EP1Testing with blank customer revision currently maps to both internal parts listed above. In Customer Part Cross Reference/Order Entry, how is the intended internal part selected when both mappings exist? Please provide an existing trace or approved controlled capture showing returned PartNum, XPartNum, RevisionNum, XRevisionNum, any selection prompt/ambiguity output, and the exact business validation message on line save (with credentials/customer data removed). Is literal EP1Testing required, or may this scenario explicitly substitute a unique per-run customer code? Please do not change/delete mappings or retry order 8145 without separate authorization.

No offline checks were rerun for this read-only/documentation investigation; prior 24-test/typecheck result is unchanged, not a new verification claim.
