"""Offline regression tests; no user catalog or live credentials required."""
import csv
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('query_catalog.py')
spec = importlib.util.spec_from_file_location('query_catalog', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class QueryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'specs').mkdir()
        (self.root / 'services').mkdir()
        self.service = 'Erp.BO.TestSvc'
        self.path = '/{currentCompany}/Erp.BO.TestSvc/Save'
        columns = ['service', 'kind', 'method', 'path', 'operationId', 'summary', 'required_inputs', 'detail_file']
        with (self.root / 'index.csv').open('w', newline='', encoding='utf-8-sig') as stream:
            writer = csv.DictWriter(stream, fieldnames=columns)
            writer.writeheader()
            writer.writerow(dict(service=self.service, kind='method', method='POST', path=self.path,
                                 operationId='Save', summary='Save, customer phone', required_inputs='body:ds',
                                 detail_file='services/Erp.BO.TestSvc.json'))
        (self.root / 'services' / (self.service + '.json')).write_text('{"operations":[]}', encoding='utf-8')
        self.doc = {
            'openapi': '3.0.1', 'info': {'title': self.service, 'version': 'v2'},
            'security': [{'ApiKey': []}],
            'paths': {self.path: {
                'parameters': [{'name': 'currentCompany', 'in': 'path', 'required': True,
                                'schema': {'type': 'string'}}],
                'post': {'operationId': 'Save',
                         'parameters': [{'name': 'currentCompany', 'in': 'path', 'required': True,
                                         'schema': {'type': 'string', 'minLength': 1}}],
                         'requestBody': {'required': True, 'content': {'application/json': {
                             'schema': {'$ref': '#/components/schemas/Row'}}}},
                         'responses': {'200': {'description': 'ok', 'content': {'application/json': {
                             'schema': {'$ref': 'shared.json#/components/schemas/Result'}}}}}}}},
            'components': {'securitySchemes': {'ApiKey': {'type': 'apiKey', 'name': 'X-API-Key', 'in': 'header'}},
                           'schemas': {'Row': {'type': 'object', 'required': ['IntPhoneNum'],
                                               'properties': {'IntPhoneNum': {'type': 'string'},
                                                              'next': {'$ref': '#/components/schemas/Row'}}}}}}
        self.file = self.root / 'specs' / (self.service + '.methods.json')
        self.write_doc()
        (self.root / 'specs' / 'shared.json').write_text(json.dumps({
            'components': {'schemas': {'Result': {'type': 'object', 'properties': {'ok': {'type': 'boolean'}}}}}}))

    def write_doc(self):
        self.file.write_text(json.dumps(self.doc))

    def cli(self, *args, success=True):
        result = subprocess.run([sys.executable, str(SCRIPT), *args, '--catalog', str(self.root)],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0 if success else 2, result.stderr)
        return json.loads(result.stdout if success else result.stderr)

    def test_csv_bom_comma_and_filter(self):
        result = self.cli('search', '--query', 'save phone', '--service', self.service.lower())
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['items'][0]['summary'], 'Save, customer phone')
        self.assertEqual(self.cli('search', '--query', 'missing')['total'], 0)

    def test_operation_refs_recursion_and_parameter_override(self):
        result = self.cli('op', '--service', self.service, '--operation', 'Save')['matches'][0]
        self.assertEqual(len(result['references']), 2)
        self.assertEqual(len(result['effective_parameters']), 1)
        self.assertEqual(result['effective_parameters'][0]['parameter']['schema']['minLength'], 1)
        self.assertEqual(result['security_schemes']['ApiKey']['name'], 'X-API-Key')

    def test_field_and_schema(self):
        result = self.cli('field', '--service', self.service, '--field', 'intphone')
        self.assertTrue(result['items'][0]['required_by_parent'])
        result = self.cli('schema', '--service', self.service, '--schema', 'Row')
        self.assertEqual(len(result['matches'][0]['references']), 1)

    def test_documented_servers_and_pointer(self):
        self.doc['paths'][self.path]['servers'] = [{'url': 'https://example.invalid/api/v2'}]
        self.write_doc()
        result = self.cli('op', '--service', self.service, '--operation', 'Save')['matches'][0]
        self.assertEqual(result['documented_servers'][0]['url'], 'https://example.invalid/api/v2')
        self.assertTrue(result['operation_pointer'].endswith('/post'))

    def test_missing_ref_fails(self):
        self.doc['components']['schemas'] = {}
        self.write_doc()
        self.assertIn('Unresolved', self.cli('op', '--service', self.service, '--operation', 'Save', success=False)['error'])

    def test_remote_ref_fails(self):
        self.doc['components']['schemas']['Row']['properties']['remote'] = {'$ref': 'https://example.invalid/schema.json'}
        self.write_doc()
        self.assertIn('Remote', self.cli('op', '--service', self.service, '--operation', 'Save', success=False)['error'])

    def test_path_escape_fails(self):
        cat = module.Catalog(self.root)
        with self.assertRaises(module.CatalogError):
            cat.resolve(self.file, '../../outside.json#/secret')

    def test_exact_path_and_output(self):
        out = self.root / 'out' / 'result.json'
        self.cli('op', '--service', self.service, '--path', self.path, '--method', 'post', '--out', str(out))
        self.assertEqual(json.loads(out.read_text())['matches'][0]['operation']['operationId'], 'Save')

    def test_paging_services_stats(self):
        self.assertEqual(self.cli('services', '--query', 'phone')['items'][0]['operations'], 1)
        self.assertEqual(self.cli('stats')['services'], 1)
        self.assertEqual(self.cli('search', '--offset', '1')['items'], [])

    def test_ambiguous_operation_fails(self):
        self.doc['paths']['/other'] = self.doc['paths'][self.path]
        self.write_doc()
        self.assertIn('Ambiguous', self.cli('op', '--service', self.service, '--operation', 'Save', success=False)['error'])

    def test_generated_only_fails_clearly(self):
        self.file.unlink()
        self.assertIn('original', self.cli('op', '--service', self.service, '--operation', 'Save', success=False)['error'])

    def test_external_structural_siblings_fail_instead_of_wrong_provenance(self):
        self.doc['paths'][self.path]['parameters'] = [
            {'$ref': 'shared.json#/components/schemas/Result',
             'schema': {'$ref': '#/components/schemas/Row'}}]
        self.write_doc()
        result = self.cli('op', '--service', self.service, '--operation', 'Save', success=False)
        self.assertIn('source-aware', result['error'])

    def test_external_specs_and_portable_batch(self):
        external = self.root / 'separate-docs'
        (self.root / 'specs').rename(external)
        selection = self.root / 'selection.json'
        selection.write_text(json.dumps([{'service': self.service, 'operation': 'Save'}]))
        result = self.cli('extract', '--spec-dir', str(external), '--selection', str(selection))
        self.assertEqual(result['bundle_version'], 1)
        op = result['selections'][0]['contract']['matches'][0]
        self.assertEqual(op['document'], 'specs/' + self.service + '.methods.json')
        self.assertEqual(len(op['references']), 2)
        self.assertNotIn(str(self.root), json.dumps(result))
        self.assertEqual(len(result['documents']), 3)  # generated summary + 2 originals
        self.assertTrue(all(len(v['sha256']) == 64 for v in result['documents'].values()))

    def test_compressed_index_without_originals(self):
        import gzip
        raw = (self.root / 'index.csv').read_bytes()
        (self.root / 'index.csv.gz').write_bytes(gzip.compress(raw))
        (self.root / 'index.csv').unlink()
        self.assertEqual(self.cli('search', '--query', 'save')['total'], 1)

    def test_batch_fails_if_one_selector_is_missing(self):
        selection = self.root / 'selection.json'
        selection.write_text(json.dumps([{'service': self.service, 'operation': 'Save'},
                                         {'service': self.service, 'operation': 'NotAnOperation'}]))
        out = self.root / 'never-written.json'
        self.cli('extract', '--selection', str(selection), '--out', str(out), success=False)
        self.assertFalse(out.exists())

    def test_external_root_confinement_and_symlink(self):
        external = self.root / 'external'
        external.mkdir()
        cat = module.Catalog(self.root / 'catalog-only', external)
        with self.assertRaises(module.CatalogError):
            cat.local(self.root / 'outside.json')
        secret = self.root / 'outside.json'
        secret.write_text('{}')
        (external / 'escape.json').symlink_to(secret)
        with self.assertRaises(module.CatalogError):
            cat.read(external / 'escape.json')

    def test_exact_external_method_path_and_schema(self):
        external = self.root / 'external'
        (self.root / 'specs').rename(external)
        self.assertEqual(self.cli('op', '--spec-dir', str(external), '--service', self.service,
                                  '--path', self.path, '--method', 'post')['matches'][0]['method'], 'POST')
        result = self.cli('schema', '--spec-dir', str(external), '--service', self.service, '--schema', 'Row')
        self.assertEqual(len(result['matches'][0]['references']), 1)

    def test_pointer_escape(self):
        self.doc['components']['schemas']['A/B~C'] = {'type': 'string'}
        self.write_doc()
        cat = module.Catalog(self.root)
        _, node, _ = cat.resolve(self.file, '#/components/schemas/A~1B~0C')
        self.assertEqual(node, {'type': 'string'})

if __name__ == '__main__':
    unittest.main()
