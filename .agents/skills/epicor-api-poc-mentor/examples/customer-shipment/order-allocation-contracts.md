# Sales order and allocation implementation contracts

Source: inspected ZIP src/api/salesOrderApi.ts, allocationApi.ts, allocationPayloadBuilders.ts and src/scenarios/customerShipment.ts. This records exact implementation shapes and runtime expectations, not independently captured live proof. Prefix paths below /{company}/Erp.BO.<service>/. No assumed environment-specific master values belong in generic templates.

## SalesOrderSvc (POST)

| Operation | Request keys / source types | Scenario response handling |
| --- | --- | --- |
| GetNewOrderHed | ds:object | parameters.ds |
| ChangeSoldToID | ds:object with changed OrderHed.CustomerCustID | parameters.ds |
| Update | ds:object | parameters.ds; generated OrderNum, saved OrderDtl/OrderRel |
| GetNewOrderDtl | ds:object, orderNum:number | parameters.ds |
| ChangePartNumMaster | partNum:string; lSubstitutePartExist/lIsPhantom:boolean; uomCode:string; SysRowID:string; rowType:string; salesKitView/removeKitComponents/suppressUserPrompts/getPartXRefInfo/checkPartRevisionChange/checkChangeKitParent/checkPartSaleable:boolean; ds:object | parameters.ds and branch outputs |
| ChangeSellingQtyMaster | ipSellingQuantity:string; chkSellQty/negInvTest/chgSellQty/chgDiscPer/lKeepUnitPrice:boolean; pcAttributeSetID/pcBinNum/pcDimCode/pcLotNum/pcPartNum/pcWhseCode/pdDimConvFactor:string; suppressUserPrompts:boolean; ds:object | parameters.ds and warning/action outputs |

Set NeedByDate using the case's business timezone; current code uses Asia/Kolkata calendar date plus T00:00:00. Do not globally copy this timezone. Keep source scalar strings rather than coercing every numeric-looking request to number.

Current part branch requires empty cDeleteComponentsMessage/cWarningMessage/cConfigPartMessage/cSubPartMessage/explodeBOMerrMessage/cMsgType/cMsgTypeSaleable, permits questionString empty or PART, rejects substitute/phantom/multiple/explosion/runout flags true. Unknown question/branch requires evidence, not forced prompt suppression. Quantity branch requires empty pcMessage/pcNeqQtyAction/opWarningMsg/cSellingQuantityChangedMsgText. Check current outputs; not all services use these names.

Saved Update response checks Company/OrderNum/PartNum/SellingQuantity/OrderQty/SalesUM/UnitPrice and generated OrderLine. OrderRel verifies order/line/plant/warehouse/OurReqQty and generated OrderRelNum. This is saved-response validation; the supplied implementation lacks a separate SalesOrder authoritative read. Add an evidenced reader before claiming independent order read-back.

## OrderAllocSvc (POST)

| Operation | Request | Scenario response |
| --- | --- | --- |
| GetListFWB | whereClause:string with validated numeric order in quoted expression, pageSize:"0", absolutePage:"0" | returnObj demand dataset, parameters.morePages=false required |
| MergeOrderAllocListsAndGetRows | ipLastDisplaySeq:"0", ds1:{}, ds2:demand dataset | returnObj with OrderAlloc |
| GetSlimOrderAlloc | ds | parameters.ds plus separate returnObj slim dataset |
| CheckDates | ds=GetSlimOrderAlloc returnObj in current code | parameters.cMessageText expected empty |
| AutoAllocation | cIPWhseList:"", cWhseType:"All", ds | parameters.lReleased and cMessageText |

Validate demand identity/order/line/release/part/site/warehouse/quantity. Current workflow selects OrderAlloc row, FulfillmentSeq=1, preserves original/changed representations, supplies PartAllocTran original and changed template rows. Original ReleaseToPicking=false/RowMod empty must remain a before-image; changed row sets true/RowMod U. Warehouse/zone/group and HANDHELD distribution are tenant-specific, not universal. The current helper returns a large captured template; don't infer every example field required.

Current acceptance matches exact one-demand allocation/release messages (allocated1, cross-docked0, selected1, submitted1) and lReleased=true. Wording/localization or multiple demand cases require fresh contracts. These outputs don't prove physical movement; identify this order's queue, then verify picking/movement independently. No speculative method-name search is needed for the supported case.
