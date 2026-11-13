#!/usr/bin/env python3
"""Offline CSV discovery and exact OpenAPI 3 contract extraction. Python stdlib only."""
import argparse
import csv
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

DEFAULT_ROOT = Path(__file__).resolve().parents[1] / 'data' / 'api-catalog'
HTTP = {'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'}

class CatalogError(Exception):
    pass

class Catalog:
    def __init__(self, root, spec_dir=None):
        self.root = Path(root).resolve()
        self.spec_root = Path(spec_dir).resolve() if spec_dir else self.root / "specs"
        self.cache = {}

    def local(self, path):
        path = Path(path).resolve()
        if not any(path.is_relative_to(root) for root in (self.root, self.spec_root)):
            raise CatalogError('Reference escapes catalog/specs roots: ' + str(path))
        return path

    def label(self, path):
        path = self.local(path)
        if path.is_relative_to(self.spec_root):
            return 'specs/' + path.relative_to(self.spec_root).as_posix()
        return 'catalog/' + path.relative_to(self.root).as_posix()

    def provenance(self):
        return {self.label(path): {'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
                for path in self.cache}

    def read(self, path):
        path = self.local(path)
        if path not in self.cache:
            try:
                self.cache[path] = json.loads(path.read_text(encoding='utf-8-sig'))
            except (OSError, ValueError) as exc:
                raise CatalogError(f'Cannot read JSON {path.name}: {exc}') from exc
        return self.cache[path]

    def rows(self):
        path = self.root / 'index.csv'
        if not path.exists():
            path = self.root / 'index.csv.gz'
        opener = gzip.open if path.suffix == '.gz' else open
        try:
            with opener(path, mode='rt', encoding='utf-8-sig', newline='') as stream:
                reader = csv.DictReader(stream)
                if not {'service', 'method', 'path', 'operationId'}.issubset(reader.fieldnames or []):
                    raise CatalogError('index.csv lacks service/method/path/operationId columns')
                return list(reader)
        except OSError as exc:
            raise CatalogError('Cannot read index.csv; supply --catalog with its parent directory') from exc

    def docs(self, service):
        # Exact names avoid accidentally scanning all services. Both spec families matter.
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', service):
            raise CatalogError('Invalid service name')
        candidates = [self.root / 'services' / (service + '.json')]
        for base in (self.spec_root, self.root / 'services', self.root):
            candidates.extend(base / (service + suffix) for suffix in ('.methods.json', '.odata.json'))
        found = []
        for path in dict.fromkeys(candidates):
            if path.exists():
                data = self.read(path)
                if isinstance(data, dict) and isinstance(data.get('paths'), dict):
                    if not str(data.get('openapi', '')).startswith('3.'):
                        raise CatalogError(f'{path.name}: only OpenAPI 3.x is supported')
                    found.append((path, data))
        if not found:
            raise CatalogError('No supported OpenAPI document for ' + service +
                               '. Supply --spec-dir pointing to original .methods.json/.odata.json files, or upload a focused extraction bundle. '
                               'Generated service JSON without OpenAPI paths is not assumed to be lossless.')
        return found

    def resolve(self, doc, ref):
        parsed = urlsplit(ref)
        if parsed.scheme or parsed.netloc or parsed.query:
            raise CatalogError('Remote/nonlocal $ref is unsupported: ' + ref)
        path = self.local(doc.parent / unquote(parsed.path)) if parsed.path else doc
        node = self.read(path)
        fragment = unquote(parsed.fragment)
        if fragment and not fragment.startswith('/'):
            raise CatalogError('Only JSON Pointer fragments are supported: ' + ref)
        try:
            for part in fragment.split('/')[1:] if fragment else []:
                key = part.replace('~1', '/').replace('~0', '~')
                node = node[int(key)] if isinstance(node, list) else node[key]
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            raise CatalogError('Unresolved $ref: ' + ref) from exc
        identity = self.label(path) + '#' + fragment
        return path, node, identity

    def deref(self, doc, node):
        visited = set()
        while isinstance(node, dict) and '$ref' in node:
            referring_doc = doc
            doc, target, identity = self.resolve(doc, node['$ref'])
            siblings = {k: v for k, v in node.items() if k != '$ref'}
            if doc != referring_doc and any(k not in {'summary', 'description'} for k in siblings):
                raise CatalogError('External reference with structural siblings needs source-aware evaluation: ' + identity)
            if identity in visited:
                raise CatalogError('Cyclic top-level reference: ' + identity)
            visited.add(identity)
            # Preserve 3.1 reference siblings without pretending to evaluate schemas.
            node = dict(target, **{k: v for k, v in node.items() if k != '$ref'})
        return doc, node

    def bundle(self, doc, value):
        definitions, links = {}, []
        def walk(source, node):
            if isinstance(node, dict):
                if any(key in node for key in ('$id', '$dynamicRef', '$recursiveRef')):
                    raise CatalogError('Schema uses unsupported URI rebasing or dynamic references')
                if isinstance(node.get('$ref'), str):
                    target_doc, target, identity = self.resolve(source, node['$ref'])
                    link = {'document': self.label(source),
                            'ref': node['$ref'], 'target': identity}
                    if link not in links:
                        links.append(link)
                    if identity not in definitions:
                        definitions[identity] = target
                        walk(target_doc, target)
                for key, child in node.items():
                    if key != '$ref':
                        walk(source, child)
            elif isinstance(node, list):
                for child in node:
                    walk(source, child)
        walk(doc, value)
        return {'references': definitions, 'reference_resolution': links}


def page(items, args):
    return {'total': len(items), 'offset': args.offset,
            'next_offset': args.offset + args.limit if args.offset + args.limit < len(items) else None,
            'items': items[args.offset:args.offset + args.limit]}


def select_rows(rows, args):
    terms = args.query.casefold().split()
    found = []
    for row in rows:
        if args.service and row.get('service', '').casefold() != args.service.casefold():
            continue
        if args.method and row.get('method', '').upper() != args.method:
            continue
        if args.operation and row.get('operationId') != args.operation:
            continue
        if args.path and row.get('path') != args.path:
            continue
        text = ' '.join(str(v or '') for v in row.values()).casefold()
        if all(term in text for term in terms):
            found.append(row)
    return found


def run(args, cat=None):
    cat = cat or Catalog(args.catalog, args.spec_dir)
    if args.command == 'extract':
        if not args.selection:
            raise CatalogError('extract requires --selection with a JSON array of exact operation selectors')
        selectors = json.loads(args.selection.read_text(encoding='utf-8-sig'))
        if not isinstance(selectors, list) or not 1 <= len(selectors) <= 100:
            raise CatalogError('selection must contain 1 to 100 selectors')
        results = []
        for selector in selectors:
            if not isinstance(selector, dict) or not isinstance(selector.get('service'), str):
                raise CatalogError('Each selector requires service')
            if set(selector) - {'service', 'operation', 'path', 'method'}:
                raise CatalogError('Unknown selector fields')
            child = argparse.Namespace(**vars(args))
            child.command = 'op'
            child.service = selector['service']
            child.operation = selector.get('operation', '')
            child.path = selector.get('path', '')
            child.method = selector.get('method', '').upper() or None
            results.append({'selector': selector, 'contract': run(child, cat)})
        return {'bundle_version': 1, 'evidence_type': 'documented-contract',
                'selections': results, 'documents': cat.provenance(),
                'limitations': ['Not live evidence or proof of business-method order; review for sensitive examples before sharing.']}
    if args.command == 'stats':
        rows = cat.rows()
        services = sorted({r['service'] for r in rows})
        missing = sorted({r.get('detail_file', '') for r in rows
                          if r.get('detail_file') and not cat.local(cat.root / r['detail_file']).is_file()})
        return {'index_rows': len(rows), 'services': len(services),
                'missing_detail_count': len(missing), 'missing_detail_files': page(missing, args),
                'note': 'Index counts and optional generated-detail existence only. Missing generated detail files are expected in an index-only installation; original contracts use --spec-dir. This is not proof of schema/download coverage.'}
    if args.command in ('search', 'services'):
        rows = select_rows(cat.rows(), args)
        if args.command == 'services':
            counts = {}
            for row in rows:
                counts[row['service']] = counts.get(row['service'], 0) + 1
            return page([{'service': k, 'operations': v} for k, v in sorted(counts.items())], args)
        columns = ('service', 'kind', 'method', 'path', 'operationId', 'summary', 'required_inputs', 'detail_file')
        return page([{k: r.get(k, '') for k in columns} for r in rows], args)
    if not args.service:
        raise CatalogError('--service is required for op, field and schema')
    docs = cat.docs(args.service)
    if args.command == 'field':
        if not args.field:
            raise CatalogError('--field is required')
        matches = []
        def walk(doc, node, pointer=''):
            if isinstance(node, dict):
                properties = node.get('properties', {})
                if isinstance(properties, dict):
                    for name, schema in properties.items():
                        if args.field.casefold() in name.casefold():
                            matches.append({'document': cat.label(doc),
                                            'parent_pointer': pointer, 'field': name,
                                            'required_by_parent': name in node.get('required', []),
                                            'schema': schema})
                for key, child in node.items():
                    walk(doc, child, pointer + '/' + key.replace('~', '~0').replace('/', '~1'))
            elif isinstance(node, list):
                for i, child in enumerate(node):
                    walk(doc, child, pointer + '/' + str(i))
        for doc, data in docs:
            walk(doc, data)
        return page(matches, args)
    if args.command == 'schema':
        if not args.schema:
            raise CatalogError('--schema is required')
        matches = []
        for doc, data in docs:
            schemas = data.get('components', {}).get('schemas', {})
            if args.schema in schemas:
                value = schemas[args.schema]
                matches.append({'document': cat.label(doc),
                                'schema_name': args.schema, 'schema': value, **cat.bundle(doc, value)})
        if not matches:
            raise CatalogError('Exact schema not found in selected service')
        return {'matches': matches}
    if not args.operation and not (args.path and args.method):
        raise CatalogError('op requires --operation or both --path and --method')
    matches = []
    for original_doc, data in docs:
        for path, original_item in data['paths'].items():
            if args.path and args.path != path:
                continue
            doc, item = cat.deref(original_doc, original_item)
            for method, original_op in item.items():
                if method not in HTTP or (args.method and method.upper() != args.method):
                    continue
                op_doc, op = cat.deref(doc, original_op)
                if args.operation and op.get('operationId') != args.operation:
                    continue
                # Preserve parameter overrides and the originating document for each.
                params = {}
                for param_doc, seq in ((doc, item.get('parameters', [])), (op_doc, op.get('parameters', []))):
                    for param in seq:
                        resolved_doc, value = cat.deref(param_doc, param)
                        key = (value.get('in'), value.get('name'))
                        params[key] = {'document': cat.label(resolved_doc),
                                       'parameter': value, **cat.bundle(resolved_doc, value)}
                security = op.get('security', data.get('security', []))
                names = {name for group in security for name in group}
                security_schemes = data.get('components', {}).get('securitySchemes', {})
                schemes = {name: security_schemes[name] for name in names if name in security_schemes}
                if names - schemes.keys():
                    raise CatalogError('Missing referenced security scheme definitions')
                result = {'document': cat.label(op_doc),
                          'openapi': data['openapi'], 'info': data.get('info', {}),
                          'path': path, 'method': method.upper(),
                          'operation_pointer': '#/paths/' + path.replace('~', '~0').replace('/', '~1') + '/' + method,
                          'path_document': cat.label(original_doc),
                          'documented_servers': op.get('servers', item.get('servers', data.get('servers', []))),
                          'operation': op,
                          'effective_parameters': list(params.values()),
                          'security': security, 'security_schemes': schemes,
                          **cat.bundle(op_doc, op)}
                result['security_references'] = cat.bundle(original_doc, schemes)
                matches.append(result)
    if not matches:
        raise CatalogError('Exact operation not found; check service, operationId, path and method')
    signatures = {(m['path'], m['method']) for m in matches}
    if len(signatures) > 1:
        raise CatalogError('Ambiguous operationId; use --path and --method to select exactly')
    return {'matches': matches,
            'documents': cat.provenance(),
            'note': 'Documented contract only. References retain source provenance; not a runtime validator.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['stats', 'services', 'search', 'op', 'field', 'schema', 'extract'])
    parser.add_argument('--catalog', type=Path, default=DEFAULT_ROOT)
    parser.add_argument('--spec-dir', type=Path, help='External original OpenAPI directory; no copying required')
    parser.add_argument('--selection', type=Path, help='JSON selectors for one portable extraction bundle')
    parser.add_argument('--service', default='')
    parser.add_argument('--query', default='', help='Case-insensitive whitespace-separated AND terms')
    parser.add_argument('--operation', default='', help='Exact operationId')
    parser.add_argument('--path', default='', help='Exact OpenAPI path')
    parser.add_argument('--method', type=str.upper, choices=sorted(m.upper() for m in HTTP))
    parser.add_argument('--field', default='', help='Case-insensitive field-name substring')
    parser.add_argument('--schema', default='', help='Exact components.schemas name')
    parser.add_argument('--limit', type=int, default=8)
    parser.add_argument('--offset', type=int, default=0)
    parser.add_argument('--out', type=Path, help='Write complete JSON to a local scratch file')
    args = parser.parse_args()
    if args.limit < 1 or args.offset < 0:
        parser.error('limit must be positive and offset nonnegative')
    try:
        result = run(args)
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(text + '\n', encoding='utf-8')
            print(json.dumps({'output': str(args.out.resolve()), 'bytes': len((text + '\n').encode('utf-8'))}))
        else:
            print(text)
    except (CatalogError, OSError, ValueError, TypeError) as exc:
        print(json.dumps({'error': str(exc)}), file=sys.stderr)
        return 2
    return 0

if __name__ == '__main__':
    sys.exit(main())
