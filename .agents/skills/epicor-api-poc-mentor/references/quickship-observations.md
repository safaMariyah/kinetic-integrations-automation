# QuickShip observed contracts

Source: user-supplied DevTools requests, response text and shipment-screen screenshots in the November 2026 discovery conversation. These are observations from one quickshipweb environment, not an OpenAPI specification or fresh agent execution. Authentication, full headers, product version, HTTP statuses for most calls and company/workstation scoping remain unverified. Parameterize the base URL; do not assume this intranet hostname is reachable elsewhere.

## Observed operations

| Method and path | Observed request and outcome | Limits |
| --- | --- | --- |
| GET `/api/shipments/{packId}` | Pack 322 returned `isSuccess:true` and `result` with `shipmentNumber`, internal `shipmentId`, `status`, `trackingNumber`, `orderNumber`, `shipmentWeight`, charges and nested ship-code/customer/billing data. | Existing shipped record only; does not establish import/create behavior. |
| GET `/api/shipments/getContainerDetails/{shipmentId}` | `result.containersForShipment[]` contains container IDs/numbers, `actualWeight`, dimensions, tracking and `containerProducts[]`. Products include shipment-line/product IDs, product key, quantities and order reference. | Capture internal shipment ID from lookup; never substitute pack number. |
| POST `/api/shipments/applyBestWay/{shipmentId}` | Body `{"shipmentId":"<same internal ID>"}`; observed `isSuccess:false`, `result:null`, `errors:[]`. | Purpose, successful branch, prerequisites and reason for failure are unverified. Do not make this a required step from its name alone. |
| PATCH `/api/shipments/updateShipment/{shipmentId}` | Body `[{"op":"replace","path":"/EstimatedWeight","value":30}]`; user reported response `Succeeded`. | JSON Patch-shaped body; Content-Type/status unverified. Existing weight was already 30, so changed-value persistence and propagation are unproven. Preserve exact path casing. |

## Interpretation and assertions

Capture returned IDs dynamically. Pack 322, order 6060 and container 306 are historical examples, not reusable test fixtures or acceptance constants. The observed shipment was Shipped with tracking; do not unship it to obtain test data.

Assert HTTP and application outcomes separately. `isSuccess:false` is not business success even if transport returns 200. Empty errors do not explain a failure. GET pack 1000 returned `isSuccess:false`, `result:null`, error code `EM0556` and message `EM0556: Shipment or Pack ID not found.` This does not establish absence in Kinetic or explain import/company context. Use a controlled missing ID for a negative test rather than assume 1000 remains missing.

Observed container had one product, quantities packed/to-ship/remaining 1/1/0, and tracking matching the shipment. These are example observations, not universal invariants. `containerTypes` and `hazmatGroups` are available choices; selected `containerType` had zero IDs/null description and selected `hazmatGroupId` was null. Do not infer a selection from a list. `containsHazmat` was false.

Keep shipment `shipmentWeight`, patch `/EstimatedWeight`, container `actualWeight`, and product `unitWeight` distinct. No conversion/propagation rule or weight unit was established. Check persisted outcomes through applicable independent reads after authorized writes.

## Remaining end-to-end evidence

Resolve Kinetic pack creation, export/import or discovery into QuickShip, unshipped pre-state, authenticated company/workstation context, container/weight mutations, actual ship operation, carrier/label effects and Kinetic write-back as required by the supplied prose. Do not infer these contracts from the reads above. Plan test-data creation as part of automation when requested; do not require a human-created pack as a permanent prerequisite. Block only dependent incomplete scope before mutations, and distinguish generated implementation from verified execution.
