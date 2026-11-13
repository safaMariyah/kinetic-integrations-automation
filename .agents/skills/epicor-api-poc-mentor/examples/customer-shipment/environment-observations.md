# Environment-specific observations, never defaults

Source: retained shipment implementation inspection and manual-capture reports; raw captures and target-version metadata are not bundled. Revalidate applicability against the current project/environment. These observations do not establish fresh live success.

- The worked transport uses an API root ending in `/api/v2/odata` plus `/{company}/service/operation`, Basic authentication and an API-key header. Derive runtime URLs and auth from current config; API Help is documentation, not the execution endpoint.
- Company, plant, employee, customer, source/destination bins, allocation warehouse/zone/group, reason, carrier, package and workstation are profile inputs. No example code or tenant values are reusable defaults. Validate existing master data without silently modifying it.
- The stock example starts at zero, uses simple untracked stock and a specific adjustment reason. Delta-versus-target behavior for nonzero stock and tracking/legal-number branches is unconfirmed.
- The example business calendar used a fixed timezone. Require the scenario's actual timezone for dates. Packaging/default methods can change dimension UOM; verify actual saved values.
- Shipment unsaved PackLine zero and selling quantity zero were reported valid before save; the saved line later received an identity and selling quantity. Unknown warning/prompt branches remain unsupported.
- Configuration was loaded from working-directory `.env`; a parent file and `.env.example` were not loaded automatically. Reuse the actual loader, never overwrite a populated file. Reject blank numeric strings before coercion.
- Integration artifacts originally lived on a server filesystem; runner access must be supplied. No path, mount, TLS exception, workstation, freight service URL or timeout value transfers automatically to another tenant.
- The worked code does not provide ERP/carrier cleanup. Preserve safe IDs and inspect retained state after failure. Context disposal does not reverse writes.

Store actual target settings and run IDs in the authorized project/run journal, outside this reusable skill. Keep secrets in the project's approved external configuration.
