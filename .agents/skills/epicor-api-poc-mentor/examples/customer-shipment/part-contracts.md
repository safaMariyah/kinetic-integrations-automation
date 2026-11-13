# Part contracts

Source: workbook Endpoint Register rows 5,8,25–26,29–30; Payload Guide P01–P05/C03; historical creation result; inspected ZIP src/api/partApi.ts, src/data/payloadBuilders.ts and customerShipment.ts. Different evidence categories remain separate.

| Operation | Exact company-prefixed path | Body / evidence |
| --- | --- | --- |
| GET part | /{company}/Erp.BO.PartSvc/Parts('{Company}','{PartNum}') | No body; escape embedded OData quotes and URL-encode; documented 200 and historical read-back |
| POST part | /{company}/Erp.BO.PartSvc/Parts | Direct single object, no ds/parameters wrapper; documented 201 JSON, historical baseline payload execution |

Baseline builder: Company, unique APIPOC- plus UUID without hyphens, PartDescription, UOMClassID=Count, IUM/PUM/SalesUM=EA, TypeCode=P, CostMethod=S, NonStock=false, QtyBearing=true. This request worked historically; RowMod omission worked for that request only. Not a verified minimum; defaults and automatic PartPlant/PartWhse setup are not established. IUM described mandatory in documentation; generated full examples are not a required-field list. TypeCode M/P/K/B and PricePerCode E/C/M are documented meanings, not permission to generalize defaults.

Current scenario extends the create body with UnitPrice and SchedBcode, then immediately reads back every supplied value before inventory mutation. The zero-price profile is an approved deviation; SchedBcode acceptance on new creation is an implementation assumption plus read-back guard, not an independently captured successful create contract. Extra fields cannot override generated identity/simple-stock fields. Scenario rejects tracking flags true; absent flags are not independently proven false.

PartPlants/PartWhses endpoints were visible in workbook; bodies/setup requirements incomplete. Their stock fields are not supported inventory adjustment methods. GET Parts/PartPlants lists do not establish actual bin stock. Visible DELETE/PATCH endpoints do not establish safe cleanup/reversal or permissions. No ERP cleanup is implemented. Collect operation-specific negative evidence and unchanged-state checks; do not invent 400/404 expectations.
