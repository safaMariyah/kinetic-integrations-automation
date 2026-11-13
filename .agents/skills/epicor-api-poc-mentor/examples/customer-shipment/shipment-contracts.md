# Shipment creation, quantities, saving and Close

Source: current ZIP ShipmentApi/customerShipment/contracts plus retained manual-capture reports (raw captures not bundled). Exact helper request shapes are source-inspected; runtime claims from absent captures remain reports. POST paths below use /{company}/Erp.BO.CustShipSvc/; reader is GET GetByID?packNum=<positive integer>, returnObj dataset. Most dataset-changing calls return parameters.ds; validate per operation.

| Operation | Source-inspected request keys/types |
| --- | --- |
| GetNewShipHead | ds:object; initializes unsaved PackNum=0 |
| GetHeadOrderInfo | orderNum:string (helper converts number), ds |
| OnChangeShipViaCode | shipViaCode:string, ds |
| GetPackaging | ipPkgCode:string, ds |
| GetNewOrdrShipDtl | packNum:number, orderNum:number, ds |
| GetOrderInfo | orderNum:string, ds |
| AfterChangedShipDtlOrderNum | ipSalesOrder:string, ipPackNum:number, ds |
| GetOrderLineInfo | packLine:number, orderLine:string, subsPart:string, ds |
| CheckPrePartInfo | partNum:string, orderNum:number, orderLine:string; no ds |
| GetOrderRelInfo | packLine:number, orderRelNum:string, allowNewShipTo:boolean, ds |
| GetWhseInfo | packLine:number, whseCode:string, whseField:string, ds |
| ValidateBinCode | ipWhse:string, ipBinNum:string; {} response, no updated shipment ds |
| GetQtyInfo | packLine:number>=0, displayInvQty:number>=0, ourJobShipQty:number>=0, ds |
| UpdateMaster | ds; doValidateCreditHold/doCheckShipDtl/doLotValidation/doCheckOrderComplete/doPostUpdate/doCheckCompliance/ipShippedFlagChanged:boolean; ipPackNum/ipBTCustNum:number |
| ChangeStatus | ipShipHedRowID:string, ipStatus:"CLOSE", ipResetCODCharges:false, ipResetInsCharges:false, ds:{} |

## Current sequence and semantics
Initialize header → order/customer → carrier → package → weight/UseBlindShipping → header UpdateMaster → fresh read. GetHeadOrderInfo populates context; GetPackaging populated dimensions and changed dimension UOM to IN in reported environment. Use dynamic BTCustNum, not hardcoded zero. Header save sets doCheckShipDtl=false; validate complete and persist assigned pack number immediately. New pack must have no unexpected saved lines.
Initialize line → order info → changed order → order line → pre-part checks → release → warehouse → validate bin → set validated BinNum on current ds → quantity method → line UpdateMaster → fresh saved read. Current GetWhseInfo capture left BinNum blank; older capture defaulted it. Neither guarantees a default. ValidateBinCode returning {} doesn't mutate/return shipment dataset.
PackLine=0 is a valid unsaved identity in captured GetQtyInfo. Earlier positive-only guard was a client limitation. Before save inventory qty=8 and selling qty=0 was acceptable; successful UpdateMaster assigned saved line identity and populated 8/8. Do not force selling quantity merely to satisfy a pre-save assertion. Preserve RowMod=A until operation changes it. Saved ShipDtl relationships verify order/line/release/part; saved header OrderNum can be 0. ShipCmpl=true is line completion, not CLOSED/FREIGHTED.

## Completion and warnings
Line save uses doCheckShipDtl=true in captured branch; flag values are context-specific, not a general validation bypass. Inspect updateComplete, all relevant error flags and business outputs, including inventory/allocation/credit/lot messages. Current assertMasterSave demands expected empty strings and false errors; success text in other services isn't globally an error.
Historical 200/false errors/updateComplete=false included negative stock and allocations elsewhere. One read proved no saved line, another later sequence showed quantities had persisted despite incomplete result. Neither universal rollback nor universal success follows. Read authoritative saved state before a retry, preserve IDs and resolve the warning through evidenced authorized behavior.
Close uses fresh header SysRowID and CLOSE; read verifies CLOSED. UpdatedInventory stayed false historically after Close/Freight; do not assert it became true. Do not reclose as polling or assume any freight/carrier effect from Close alone.
