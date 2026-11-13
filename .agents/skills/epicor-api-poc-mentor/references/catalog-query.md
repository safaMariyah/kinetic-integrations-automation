# Catalog discovery and focused contract extraction

## Storage and access

The bundled `data/api-catalog/index.csv.gz` is a lossless compressed copy of the supplied full index: 56,405 operations across 1,830 services. `services.csv` and `provenance.json` accompany it. Discovery works offline without original specs, network or credentials. This is a supplied snapshot with unknown target version, not proof of complete downloads or cross-tenant applicability.

Keep original specs externally; do not upload or bundle a multi-gigabyte folder. The script accepts two independent locations:

- `--catalog`: directory containing `index.csv` or `index.csv.gz` (plain CSV takes precedence). Default: bundled `data/api-catalog`.
- `--spec-dir`: original OpenAPI JSON directory. Default: `<catalog>/specs` for backward compatibility. Expected exact names: `<service>.methods.json`, `<service>.odata.json`. Preserve relative shared-schema files beneath an allowed root. Both methods and OData matter. Do not duplicate the originals just to match a folder layout.

Use Python 3.9+ and its standard library. Original OpenAPI 3.x JSON is supported. Swagger 2.0, YAML, remote references, anchors, URI rebasing/dynamic refs and external refs with structural siblings are not evaluated; errors are explicit rather than guessed conversions. Generated `{service, operations}` JSON from the supplied builder flattens fields, clips descriptions/enums/depth and merges variants; it is not lossless and is not used as a substitute for original schemas. A generated service file is accepted for exact extraction only if it is itself OpenAPI 3.x with `paths`.

A local Windows path is not accessible merely because it is mentioned in chat. Check actual runtime access first. With no access, use the focused bundle procedure below. Do not claim the tool uploaded, connected or mounted anything.

## Bounded discovery

Run from the skill root, or use an absolute script path. Windows may use `py -3` instead of `python`:

```text
python scripts/query_catalog.py stats
python scripts/query_catalog.py services --query receipt --limit 5
python scripts/query_catalog.py search --query receipt --limit 5
python scripts/query_catalog.py search --service Erp.BO.CustShipSvc --operation GetByID --limit 5
```

Queries use case-insensitive whitespace-separated AND terms, not semantic matching. Try related words/services and both custom/OData operations before declaring a gap. Search results never prove absence. Service discovery comes from the index; index required_inputs is only a navigation summary. `--limit`/`--offset` paginate discovery and fields. `stats` bounds its missing-detail list; missing generated detail files in an index-only installation are expected, not proof the API is absent.

## Exact retrieval and one local handoff

Choose exact operation IDs or method/path pairs found by discovery. Copy `scripts/query_catalog.py` from the skill into the local catalog project's `scripts` directory when extracting on Windows; it has no installation dependencies beyond Python. With local `catalog-full` and `specs` sibling directories, a focused command is:

```powershell
python .\scripts\query_catalog.py op --catalog .\catalog-full --spec-dir .\specs --service Erp.BO.CustShipSvc --operation GetByID --out .\contract-bundles\shipment-read.json
```

That service/operation is an example, not the default workflow. Substitute actual selectors found for the task. `field --service ... --field ...` discovers inline property names in only that service's original documents. `schema --service ... --schema ... --out ...` extracts an exact component schema and reachable refs. Field matches do not establish writability; inline required membership does not evaluate allOf constraints.

For several operations, write a scenario-specific selection JSON array (no credentials or target URLs):

```json
[
  {"service": "Erp.BO.CustShipSvc", "operation": "GetByID"},
  {"service": "Erp.BO.CustShipSvc", "operation": "ChangeStatus"}
]
```

Then use **one** local command:

```powershell
python .\scripts\query_catalog.py extract --catalog .\catalog-full --spec-dir .\specs --selection .\scenario-selection.json --out .\contract-bundles\scenario-contracts.json
```

Selectors also accept `service`, exact `path`, and `method` instead of operationId; prefer that when IDs are ambiguous. Maximum 100 selectors; choose only relevant operations. Selection fails explicitly if any requested contract/ref cannot be resolved; no partial success bundle is written. Upload only the resulting reviewed JSON to the conversation. Large results remain local for targeted inspection; split selectors into focused groups if needed, never truncate required schema definitions.

## Bundle interpretation and limits

`op` returns full selected operation, effective path/operation parameters (operation overrides matching path parameter), security definitions, documented servers and reachable references. `extract` returns these results for the selected operations plus document SHA-256 fingerprints. References retain canonical logical identities under `specs/` or `catalog/`, not absolute machine paths; `reference_resolution` maps each ref and origin to its definition in `references`. Parameter/security bundles retain their own reference maps. Inspect the entire relevant bundle, not only the operation body. It is an evidence bundle, not a directly executable JSON Schema validator and not a replacement OpenAPI spec.

Local and relative-file JSON Pointers, escaped names and cyclic schemas are supported. References outside both explicitly allowed roots fail, including symlink escapes. Remote refs are never fetched. Do not use documented server URLs as execution configuration. Documentation can contain internal URLs/examples or personal data; review bundles before sharing. Fingerprints identify the files used; they do not prove freshness or version applicability.

The script parses only selected service documents/reachable dependencies, but must parse those complete JSON files locally; an exceptionally large single service can still need substantial memory. Batch extraction caches selected files within that invocation. CSV discovery never scans all service JSON. For large outputs use `--out` and inspect required portions programmatically. Reuse extraction results in the task.

Fixture tests cover external roots, path confinement, recursive refs, parameter overrides and bundles. Actual uploaded index discovery is checked separately; original user specs and real full-contract extraction remain unverified until supplied through a focused bundle. Neither type/schema evidence nor an index proves method ordering, valid master data or live success.
