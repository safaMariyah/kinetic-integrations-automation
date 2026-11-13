"""Offline regressions for scenario-spec integrity; no network or ERP dependencies."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest
from validate_scenario import validate

ROOT = Path(__file__).resolve().parents[1]


class ScenarioValidationTests(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((ROOT / 'assets/templates/scenario-spec.json').read_text())

    def test_read_only_template_is_valid(self):
        self.assertEqual(validate(self.spec), [])

    def test_uncovered_source_step_fails(self):
        self.spec['source_steps'].append({'id': '2', 'source_id': 'source-prose', 'text': 'Another business criterion'})
        self.assertTrue(any('coverage' in x for x in validate(self.spec)))

    def test_dependency_cycle_or_future_reference_fails(self):
        self.spec['actions'][0]['depends_on'] = ['read-part']
        self.assertTrue(any('dependencies' in x for x in validate(self.spec)))

    def test_unknown_contract_fails(self):
        self.spec['actions'][0]['operation_id'] = 'invented'
        self.assertTrue(any('operation_id' in x for x in validate(self.spec)))

    def test_assumed_contract_requires_open_gap(self):
        self.spec['operations'][0]['status'] = 'assumed'
        self.assertTrue(any('open gap' in x for x in validate(self.spec)))
        self.spec['gaps'].append({'id': 'contract-gap', 'target_ids': ['part-get'], 'status': 'open',
            'missing_fact': 'Required schema unavailable', 'requested_artifact': 'Exact operation schema'})
        self.assertEqual(validate(self.spec), [])

    def test_mutation_requires_effect_and_verification(self):
        action = self.spec['actions'][0]
        action.update(mutation=True, effects=[], verification_ids=[])
        errors = validate(self.spec)
        self.assertTrue(any('effects' in x for x in errors))
        self.assertTrue(any('verification_ids' in x for x in errors))

    def test_exclusion_needs_explicit_approval(self):
        self.spec['deviations'] = [{'id': 'price-change', 'status': 'proposed', 'original': 'price1', 'replacement': 'price0'}]
        self.spec['coverage'][0].update(disposition='approved-exclusion', references=['price-change'], deviation_id='price-change')
        self.assertTrue(any('approved deviation' in x for x in validate(self.spec)))
        self.spec['deviations'][0].update(status='approved', approval_ref='user-explicit-price-instruction')
        self.assertEqual(validate(self.spec), [])

    def test_implemented_stage_needs_real_code_reference(self):
        self.spec['status'] = self.spec['variants'][0]['status'] = 'implemented'
        self.assertTrue(any('implemented actions' in x for x in validate(self.spec)))
        self.spec['actions'][0]['implementation'].update(status='implemented', reference='tests/read.spec.ts')
        self.assertEqual(validate(self.spec), [])

    def test_mock_evidence_cannot_claim_live(self):
        self.spec['actions'][0]['implementation'].update(status='implemented', reference='tests/read.spec.ts')
        self.spec['status'] = self.spec['variants'][0]['status'] = 'live-verified'
        self.spec['validation'] = [
            {'variant_id': 'default', 'type': 'typecheck', 'result': 'passed', 'source_ref': 'compiler-exit0'},
            {'variant_id': 'default', 'type': 'mock-test', 'result': 'passed', 'source_ref': 'local-log'}]
        self.assertTrue(any('live-api-test' in x for x in validate(self.spec)))

    def test_variants_need_their_own_evidence(self):
        second = copy.deepcopy(self.spec['variants'][0])
        second.update(id='second', status='typechecked')
        self.spec['variants'][0]['status'] = 'typechecked'
        self.spec['variants'].append(second)
        self.spec['assertions'][0]['variant_ids'].append('second')
        self.spec['actions'][0]['implementation'].update(status='implemented', reference='tests/read.spec.ts')
        self.spec['validation'] = [{'variant_id': 'default', 'type': 'typecheck', 'result': 'passed', 'source_ref': 'compiler-exit0'}]
        self.assertTrue(any('second' in x and 'typecheck' in x for x in validate(self.spec)))

    def test_duplicate_id_and_unknown_reader_fail(self):
        self.spec['actions'].append(copy.deepcopy(self.spec['actions'][0]))
        self.spec['assertions'][0]['reader_action_id'] = 'not-real'
        errors = validate(self.spec)
        self.assertTrue(any('duplicate' in x for x in errors))
        self.assertTrue(any('reader' in x for x in errors))

    def test_navigation_and_assertion_coverage(self):
        self.spec['source_steps'].append({'id': 'nav', 'source_id': 'source-prose', 'text': 'Open screen', 'expectations': []})
        self.spec['coverage'].append({'step_id': 'nav', 'disposition': 'navigation', 'references': [], 'reason': 'No business state change'})
        self.spec['coverage'].append({'step_id': '1', 'disposition': 'assertion', 'references': ['part-identity']})
        self.assertEqual(validate(self.spec), [])

    def test_expected_result_cannot_disappear(self):
        self.spec['assertions'][0]['source_expectation_ids'] = []
        self.assertTrue(any('uncovered expected' in e for e in validate(self.spec)))
        self.spec['gaps'].append({'id': 'criterion-gap', 'target_ids': ['1'], 'expectation_ids': ['1.identity'],
            'missing_fact': 'Expected reader unknown', 'requested_artifact': 'Reader contract', 'status': 'open'})
        self.assertEqual(validate(self.spec), [])

    def test_assumed_operation_cannot_be_implemented(self):
        self.spec['operations'][0]['status'] = 'assumed'
        self.spec['actions'][0]['implementation'].update(status='implemented', reference='test.ts')
        self.spec['gaps'].append({'id': 'contract-gap', 'target_ids': ['part-get'], 'status': 'open',
            'missing_fact': 'Schema unknown', 'requested_artifact': 'Operation schema'})
        self.assertTrue(any('supported contract' in e for e in validate(self.spec)))

    def test_live_evidence_does_not_invent_other_checks(self):
        self.spec['actions'][0]['implementation'].update(status='implemented', reference='test.ts')
        self.spec['status'] = self.spec['variants'][0]['status'] = 'live-verified'
        self.spec['validation'] = [{'variant_id': 'default', 'type': 'live-api-test', 'result': 'PASS', 'source_ref': 'run-log'}]
        self.assertEqual(validate(self.spec), [])

    def test_persisted_assertion_cannot_use_mutation_response(self):
        self.spec['actions'][0].update(mutation=True, effects=['changes employee'])
        self.spec['assertions'][0]['kind'] = 'persisted-state'
        self.assertTrue(any('non-mutating' in e for e in validate(self.spec)))

    def test_cli_success_and_missing_file_exit(self):
        script = str(ROOT / 'scripts/validate_scenario.py')
        ok = subprocess.run([sys.executable, script, str(ROOT / 'assets/templates/scenario-spec.json')], capture_output=True)
        self.assertEqual(ok.returncode, 0)
        bad = subprocess.run([sys.executable, script, str(ROOT / 'assets/templates/does-not-exist.json')], capture_output=True)
        self.assertNotEqual(bad.returncode, 0)


if __name__ == '__main__':
    unittest.main()
