# Evidence requests for <scenario>

Delivery tier: B | C. An incomplete scenario must fail completeness preflight before any mutation.

## API evidence (batch)

| ID | Source steps / criteria | Missing fact | Sources/queries already inspected | Blocked transition/assertion | Smallest evidence needed |
| --- | --- | --- | --- | --- | --- |
| <id> | <IDs> | <exact unknown> | <searches> | <IDs> | <schema excerpt, sanitized pair, code or focused capture> |

Request capture only when documentation/implementation cannot resolve the fact. If needed, specify exact known UI actions and the inspected capture CLI with actual feasible paths; do not invent clicks, values or flags. Browser capture is separate discovery, not part of the API test. Key-based redaction is limited: review every output before sharing. Never request auth state or raw secrets.

## Business decisions (separate batch)

| ID | Source conflict/unknown | Choices and impact | Blocked criterion | Decision/approval reference |
| --- | --- | --- | --- | --- |
| <id> | <exact uncertainty> | <meaningful choices> | <IDs> | <pending or explicit user reference> |

## Harmless assumptions applied

| ID | Assumption | Basis | Impact if wrong |
| --- | --- | --- | --- |
| <id> | <default retained/substitution> | <role and evidence> | <impact> |
