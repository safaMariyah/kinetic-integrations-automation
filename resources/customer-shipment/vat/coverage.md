# VAT source coverage

Source text and complete sample JSON: source-prose.txt. UI navigation/screens map to API business outcomes; browser rendering is outside this API-only regression. No substantive business assertion is dropped.

| Source | Implementation / assertion |
|---|---|
| 1 | Existing setup; authenticated reads verify company, REST integration, workstation and QuickShip readiness. UI home screens are navigation, not browser assertions. |
| 2 | Existing setup; authenticated reads verify company, REST integration, workstation and QuickShip readiness. UI home screens are navigation, not browser assertions. |
| 3 | Existing setup; authenticated reads verify company, REST integration, workstation and QuickShip readiness. UI home screens are navigation, not browser assertions. |
| 4 | Existing setup; authenticated reads verify company, REST integration, workstation and QuickShip readiness. UI home screens are navigation, not browser assertions. |
| 5 | Existing setup; authenticated reads verify company, REST integration, workstation and QuickShip readiness. UI home screens are navigation, not browser assertions. |
| 6 | Existing setup; authenticated reads verify company, REST integration, workstation and QuickShip readiness. UI home screens are navigation, not browser assertions. |
| 7 | Existing setup; authenticated reads verify company, REST integration, workstation and QuickShip readiness. UI home screens are navigation, not browser assertions. |
| 8 | Unique purchased stock part, TypeCode=P and UnitPrice=1 |
| 9 | Persisted SchedBcode=2222.22 |
| 10 | Adjust 200; independent source stock read |
| 11 | Customer.CustomerVATNum=BillingVAT; selected EDA-A ShipTo.ShipToVAT=SHIPTOVAT; separate saves and reads |
| 12 | Persisted order number and EDA-A header selection |
| 13 | Quantity 100 and saved customer-part field retained for shipment comparison |
| 14 | Exact 1 allocated / 0 cross docked / 1 selected / 1 submitted; screen and print prompts are UI navigation equivalents, no printing requested. |
| 15 | Exact 1 allocated / 0 cross docked / 1 selected / 1 submitted; screen and print prompts are UI navigation equivalents, no printing requested. |
| 16 | Exact 1 allocated / 0 cross docked / 1 selected / 1 submitted; screen and print prompts are UI navigation equivalents, no printing requested. |
| 17 | Exact 1 allocated / 0 cross docked / 1 selected / 1 submitted; screen and print prompts are UI navigation equivalents, no printing requested. |
| 18 | Exact 1 allocated / 0 cross docked / 1 selected / 1 submitted; screen and print prompts are UI navigation equivalents, no printing requested. |
| 19 | Exact 1 allocated / 0 cross docked / 1 selected / 1 submitted; screen and print prompts are UI navigation equivalents, no printing requested. |
| 20 | Exact order/release/part queue and IssueReturn identity |
| 21 | SHP/SHP-1, quantity 100; independent complete queue query proves disappearance |
| 22 | Pack number, F92, BOX, today ship date, EDA-A |
| 23 | Persisted shipment quantity 100, warehouse/bin and customer part matches saved order |
| 24 | 3 LB and independently persisted CLOSED status |
| 25 | Freight success, persisted FREIGHTED, exact returned transaction and nonempty tracking |
| 26 | Independent authenticated read using returned QuickShip shipment number; order/tracking/company correlated, internal ID validated separately |
| 27 | Fresh unambiguous actual request matched by order/pack; VAT and customer/ship-to identity; actual successful carrier response by transaction/pack/tracking |
