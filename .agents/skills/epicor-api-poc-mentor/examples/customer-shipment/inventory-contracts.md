# Inventory adjustment and verification

Source: workbook Endpoint Register 9–14, Payload Guide Q01–Q08/C03/F rows and inspected ZIP InventoryApi/customerShipment stock stage. Workbook described discovery-only history; now the six calls are implemented and mock-tested. No fresh live inventory run is established by the bundled ZIP alone.

All methods POST /{company}/Erp.BO.InventoryQtyAdjSvc/<operation>. Documented custom success 200; negative contracts vary/unconfirmed.

| Operation | Exact request | Response handoff |
| --- | --- | --- |
| GetInventoryQtyAdj | partnumber:string, uomCode:string | Initial ds=returnObj |
| OnChangeWareHseCode | wareHseCode:string, ds:object | parameters.ds; keep returnObj.InventoryQtyAdjBrw browse separate |
| OnChangeBinNum | binNum:string, ds:object | parameters.ds |
| OnChangingAdjustQuantity | adjustQuantity:number, ds:object | parameters.ds |
| PreSetInventoryQtyAdj | ds:object | parameters.ds; requiresUserInput |
| SetInventoryQtyAdj | ds:object | parameters.ds/partTranPKs documented; scenario requires nonblank string transaction keys |

Preserve row WareHseCode versus scalar wareHseCode and all relevant tables: InventoryQtyAdj, LegalNumGenOpts, SelectedSerialNumbers, SNFormat, ExtensionTables. Never replace adjustment ds with browse rows. RequiresUserInput must be resolved through an evidenced branch, not forced false. Method names do not establish absence of effects. Do not add speculative RowMod or tracking fields universally.

Current simple-stock scenario marks the initialized row changed, selects warehouse/bin, checks server OnHandQty=0 and EA, invokes quantity logic, sets ReasonCode=ADD, requires prepared OnHandQty=0/AdjustQuantity=stockQty/NewOnHandQty=stockQty, then saves once and independently checks persisted source bin stock. ADD, zero-baseline semantics and RowMod behavior are scope checks/profile assumptions, not documented defaults for other environments. The initial baseline check is from the adjustment work dataset, not an independent precommit bin read; don't overstate it. For extensions establish reliable baseline/expected outcome and reason/date/setup/context before commit.

Independent readers are in picking-contracts. Absence of a row is not universally zero. Match company/part/site/warehouse/bin/UOM/tracking and relevant pagination. Preserve transaction keys on success and IDs before uncertain mutations; no automatic replay after timeout. Quantity delta versus target for arbitrary nonzero stock, legal-number/tracking branches and cleanup/reversal remain unconfirmed beyond supported profile.
