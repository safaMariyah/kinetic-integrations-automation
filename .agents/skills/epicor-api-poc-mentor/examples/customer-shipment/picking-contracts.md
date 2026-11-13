# Queue, picking and independent stock

## Sources and boundaries
Current source-inspected ZIP PickingApi, MovementApi, contracts.ts and customerShipment.ts; retained manual-capture reports (raw captures not bundled). All service paths append to /{company} after /api/v2/odata. Current no-warning branch is implemented/mock-tested; raw new manual captures are not bundled. Unknown prompt/action mappings remain unsupported, not missing unconditional adapters.

## Queue discovery and selection
POST /Erp.BO.MaterialQueueSvc/GetRowsCustomParams keys: whereClause:string, fromDate/toDate:string, fromWhse/toWhse/tranType/selectedByEmpID/excludeTransStatus:string, onlySelectedByEmp/onlyUnselected:boolean, pageSize/absolutePage:number. Returns returnObj.MtlQueue plus parameters.morePages. Historical MtlQueueSeq filter worked; current code extends to OrderNum=<new order> with both selection flags false. Reject morePages not false and ambiguous/mismatched rows. Match company/order/line/release/part/tranType, plant/quantity/UOM/source/destination and fresh SysRowID.
GetRowsCustom is different: Params body sent there produced HTTP400 missing delimitedFilterString. Check URL rather than invent payload. Deprecated did not mean unavailable. Historical onlyUnselected=true hid a queue even with blank SelectedByEmpID; employee/group/HOLD explanations remained hypotheses. Operational Employee and external payroll are different records. Don't repeat inconclusive service searches.

POST MaterialQueueSvc/Update selects with ds.MtlQueue=[original,changed], same identity/revision; changed SelectedByEmpID=current employee, SelectedForProcessing=true, RowMod=U, original RowMod empty. Response parameters.ds. Use fresh server rows; selection/locking/movement are separate mutations.

## IssueReturn handoffs and branch gates
| POST operation | Request | Response / handling |
| --- | --- | --- |
| /Erp.BO.IssueReturnSvc/PreGetNewIssueReturn | pcMtlQueueRowID:string | parameters.pcAction:string, pcMessage:string, pdQtyAvailable:number; only empty action/message supported, independent stock checked separately |
| /Erp.BO.IssueReturnSvc/GetNewIssueReturn | pcTranType:"", pcMtlQueueRowID, pCallProcess:"MaterialQueue", ds with empty IssueReturn/LegalNumGenOpts/SelectedSerialNumbers/SNFormat arrays | parameters.ds; retain queue link MtlQueueRowId and order release field OrderRel |
| /Erp.BO.MaterialQueueSvc/VerifyMtlQueueExists | sysRowID:string | boolean returnObj must be true; do not replace IssueReturn ds |
| /Erp.BO.IssueReturnSvc/PrePerformMaterialMovement | ds | parameters.ds, requiresUserInput; legal-number gate is not a stock check |
| /Erp.BO.IssueReturnSvc/MasterInventoryBinTests | ds | parameters.ds plus pcNeqQtyAction/pcNeqQtyMessage/pcPCBinAction/pcPCBinMessage/pcOutBinAction/pcOutBinMessage; only empty outputs continue |
| /Erp.BO.MaterialQueueSvc/LockUnLockMtlQueForEmpID | ipTranStatus:"USER-LOCK", ipMtlQueueSeq:number, ipEmpID:string, ds:{MtlQueue:[]} | Separate MaterialQueue dataset; do not discard current IssueReturn ds |
| /Erp.BO.IssueReturnSvc/PerformMaterialMovement | plNegQtyAction:false, ds:current IssueReturn | parameters.legalNumberMessage and partTranPKs; preserve transactions, verify stock independently |

Captured/implemented order is select → pre-initialize → initialize → stock read → queue exists → prepare → bin tests → lock → move → stock read. No-warning plNegQtyAction=false is not a universal override. NegativeInventoryTest action is a string; never cast to a boolean or invent sign/action mappings. PerformMaterialMovement2 is a different schema-inspected variant, not the captured successful method. OnChangeTranQty historically updated work quantity; current scenario uses initialized matched queue quantity directly.

## Stock readers
Current implementation: POST /Erp.BO.PartBinSearchSvc/GetFullBinSearch with {partNum:string,whseCode:"",consolidateInvAttributes:true}; returnObj.PartBinSearch. Filters company, part, plant, warehouse/bin, IUM=EA, AttributeSetID=0, LotNumber="", PCID="" and demands one numeric QtyOnHand row. Review completeness/consolidation for tracking extensions; don't assume full pagination semantics from the name.
Historical alternative: POST /Erp.BO.PartBinSearchsvc/GetPartBinSearchResult with pageSize, absolutePage, whereClause; returnObj.PartBinSearch/parameters.morePages. Preserve its different service spelling and contract; don't replace GetFullBinSearch body with it. Historical filter included DisplayAllBins=false, PartNum, WhseCode, DimCode=EA, AttributeSetID=0, BinType=NoSMI, VendorNum=0.
Match all relevant dimensions. Bin definition/setup screens are not balances. Missing row isn't a numeric-zero contract. Current fresh-part scenario records destination absence, then expects newly created destination row; it is not a reusable absence-as-zero rule. Independent historical movement verified source 10→2 and destination8. Reset IssueReturn row OnHandQty=-8 is not persisted bin stock. Queue disappearance alone proves neither movement nor deletion.

MoveRequestSvc/ProcessRequest, IMMoveRequestSvc/SetMoveRequest and GetSelectedMtlQueueList did not establish completing an existing pick; preserve their negative investigation findings. Use the evidenced IssueReturn route instead of searching service names again.
