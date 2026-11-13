# Freight and actual integration evidence

Source: current ZIP FreightApi/contracts/customerShipment/quickShip and retained reports of manual captures (raw captures not bundled). All paths append /{company}. Contract implementation, manual report, local mock and live result remain distinct.

| POST path | Request / result |
| --- | --- |
| /Erp.BO.CustShipSvc/ConvertToManifestUOM | ipPackNum:number; {} |
| /Erp.BO.FreightServiceSvc/BuildCustFreightRequest | packID:number; dataset under returnObj |
| /Erp.BO.FreightServiceSvc/UpdateTimeOut | {}; parameters.httpTimeOut historically60; effect beyond response unknown |
| /Erp.BO.FreightServiceSvc/FreightCarton | freightURL:string, rdt:object, WorkStationID:string, httpTimeOut:number; returnObj contains FreightCartonResponse and FreightCartonResponseTracking |
| /Erp.BO.FreightServiceSvc/UpdateFreightedShipment | ipPackID:number, ipShipmentType:"Sales", ds:complete FreightCarton returnObj; {} |

Validate ErrorFlag=false, ErrorStatus=SUCCESS, nonblank TransactionNumber and pack-specific nonblank tracking; retain both tables with IDs/RowMod. ErrorMessage may contain Success text; nonempty is not universally failure. UpdateFreightedShipment gets complete response dataset, then fresh shipment read compares FREIGHTED, TrackingNumber, MFTransNum and actual line relationships/quantities. Preserve Sales versus SALES/SPACK casing by contract. Outbound FreightApi currently selects only MasterPackInfo/PackInfo/OrderInfo/OrderLine from Build. Historical other tables were empty; do not silently drop nonempty COO/kit/phantom/UPSQV/extensions in broader scenarios. ApplyRateShoppingRates appeared historically but necessity/contract not established.

Initial FreightCarton HTTP400/EM0306/Primary Tariff ID failure resolved with mentor Schedule B change; old exact field update/code wasn't captured. New scenario assumes SchedBcode create input, guarded by read-back; do not universalize. Inspect price/tariff/profile approval before freight. Client milliseconds and service timeout units must be evidenced; worked input assumes service seconds and validates client budget. Context/test timeout budgets must cover actual flow. Never retry Freight after uncertain timeout; carrier records may already exist. Cancellation/cleanup unsupported.

## Request and response verification
Read actual generated files from runner-accessible storage. A server-local path isn't automatically mounted on a developer machine/CI. Manual copying remains manual evidence collection. QuickShip shipment request differs from FedEx-specific request/reply. Correlate this run's transaction, pack/order/part and tracking, with freshness; reject stale/ambiguous/unrelated matches. Use bounded read-only polling for delayed or partially written JSON, never repeat freight.

Source quickShip.ts validates request shipmentReference/orderReference (strings), strict boolean blindShipping, packageWeight; one containers entry with containerTypeCode, weight, dimensionUOM=IN; one packingDetail with qtyPacked/unitPrice/orderPrice/orderlineNumber/orderReference; product productKey/tariff/unitOfMeasure=EA. It does not verify numeric length/width/height, all UOM fields or multiple containers/lines. Extend with captured schema/approved values before claiming full dimensions or arbitrary shipments.
Response artifact can be JSON encoded inside a JSON string; decode the observed encoding (current decoder max2 parses/BOM stripping), then require ReturnStatus=SUCCESS, ShipmentNumber matching transaction, and ReturnedContainers PackID/tracking. Current waitForQuickShipResponse uses shipmentresponse_<transaction>.json plus internal correlation. Request poller uses internal pack/order and mtime, not transaction filename; tighten with evidenced filename/transaction when available. Do not treat mtime alone as authenticity or run linkage.

Original reference-only acceptance covered retained records. New implementation expands actual file assertions substantially; mock tests prove local validation, not that live output has those values. Customer=false prerequisite plus shipment false/true is the supported intended scope; it does not resolve customer=true precedence or prove true live. Do not modify shared customer automatically. The worked example uses a scoped zero-price deviation; never claim original1.00 criterion passed. Strip authentication/customer payloads from report attachments; use whitelisted IDs and safe mismatch descriptions.
