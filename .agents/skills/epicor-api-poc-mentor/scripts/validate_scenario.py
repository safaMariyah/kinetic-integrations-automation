#!/usr/bin/env python3
"""Check scenario structure and referential consistency; never execute APIs."""
import json
import sys
from pathlib import Path

STAGES = ['mapped', 'implemented', 'typechecked', 'locally-tested', 'live-verified', 'integration-verified', 'pipeline-verified']
EVIDENCE = {'typechecked': 'typecheck', 'locally-tested': 'mock-test', 'live-verified': 'live-api-test', 'integration-verified': 'integration-artifact', 'pipeline-verified': 'pipeline-run'}


def validate(spec):
    errors = []
    def need(condition, message):
        if not condition:
            errors.append(message)
    def text(value):
        return isinstance(value, str) and bool(value.strip())
    def group(name):
        value = spec.get(name)
        need(isinstance(value, list), name + ' must be an array')
        return value if isinstance(value, list) else []
    def index(items, name):
        result = {}
        for item in items:
            if not isinstance(item, dict):
                errors.append(name + ' entries must be objects')
                continue
            key = item.get('id')
            if not text(key):
                errors.append(name + ' entries require id')
                continue
            need(key not in result, name + ' duplicate id: ' + key)
            result[key] = item
        return result
    def refs(value, choices, label, nonempty=False):
        if not isinstance(value, list):
            errors.append(label + ' must be an array')
            return
        if nonempty:
            need(bool(value), label + ' must not be empty')
        for ref in value:
            need(isinstance(ref, str) and ref in choices, label + ' has unknown reference: ' + str(ref))
    if not isinstance(spec, dict):
        return ['scenario must be an object']
    need(spec.get('schema_version') == 1, 'schema_version must be 1')
    need(text(spec.get('scenario_id')), 'scenario_id required')
    need(text(spec.get('objective')), 'objective required')
    need(isinstance(spec.get('environment'), dict), 'environment object required')
    need(isinstance(spec.get('inputs'), dict), 'inputs object required')
    sources = index(group('sources'), 'sources')
    steps = index(group('source_steps'), 'source_steps')
    entities = index(group('entities'), 'entities')
    preconditions = index(group('preconditions'), 'preconditions')
    deviations = index(group('deviations'), 'deviations')
    operations = index(group('operations'), 'operations')
    variants = index(group('variants'), 'variants')
    actions = index(group('actions'), 'actions')
    assertions = index(group('assertions'), 'assertions')
    gaps = index(group('gaps'), 'gaps')
    coverage = group('coverage')
    checks = group('validation')
    need(bool(sources) and bool(steps), 'sources and source_steps must not be empty')
    need(bool(variants), 'at least one variant required')
    expectations = {}
    for step in steps.values():
        need(step.get('source_id') in sources, 'step source_id unknown')
        need(text(step.get('text')), 'step text required')
        declared = step.get('expectations', [])
        need(isinstance(declared, list), 'step expectations must be an array')
        for expected in declared if isinstance(declared, list) else []:
            if not isinstance(expected, dict):
                errors.append('expectation must be an object')
                continue
            eid = expected.get('id')
            if not text(eid):
                errors.append('expectation id required')
                continue
            need(eid not in expectations, 'duplicate expectation id: ' + eid)
            need(text(expected.get('text')), 'expectation text required')
            expectations[eid] = step['id']
    for deviation in deviations.values():
        need(deviation.get('status') in ['proposed', 'approved'], 'deviation status invalid')
        need(text(deviation.get('original')) and text(deviation.get('replacement')), 'deviation original/replacement required')
        if deviation.get('status') == 'approved':
            need(text(deviation.get('approval_ref')), 'approved deviation needs approval_ref')
    all_targets = set(actions) | set(assertions) | set(operations) | set(preconditions) | set(steps)
    for gap in gaps.values():
        refs(gap.get('target_ids'), all_targets, 'gap target_ids', True)
        refs(gap.get('expectation_ids', []), expectations, 'gap expectation_ids')
        need(text(gap.get('missing_fact')) and text(gap.get('requested_artifact')), 'gap requires fact/artifact')
        need(gap.get('status') in ['open', 'resolved'], 'gap status invalid')
        if gap.get('status') == 'resolved':
            need(text(gap.get('resolution_ref')), 'resolved gap requires resolution_ref')
    for op_id, op in operations.items():
        need(text(op.get('contract_ref')), 'operation requires contract_ref: ' + op_id)
        need(op.get('status') in ['supported', 'assumed', 'missing'], 'operation status invalid')
        if op.get('status') != 'supported':
            need(any(g.get('status') == 'open' and op_id in g.get('target_ids', []) for g in gaps.values()), 'unsupported operation needs open gap: ' + op_id)
    earlier = set()
    for action_id, action in actions.items():
        refs(action.get('source_step_ids'), steps, 'action source steps', True)
        refs(action.get('depends_on'), earlier, 'action dependencies')
        earlier.add(action_id)
        need(action.get('operation_id') in operations, 'action operation_id unknown: ' + action_id)
        need(isinstance(action.get('inputs'), dict) and isinstance(action.get('outputs'), dict), 'action inputs/outputs required')
        need(isinstance(action.get('mutation'), bool), 'action mutation must be boolean')
        refs(action.get('verification_ids'), assertions, 'action verification_ids', action.get('mutation') is True)
        if action.get('mutation') is True:
            need(isinstance(action.get('effects'), list) and bool(action['effects']), 'mutation effects required: ' + action_id)
        implementation = action.get('implementation', {})
        need(isinstance(implementation, dict) and implementation.get('status') in ['planned', 'implemented', 'blocked'], 'implementation status invalid')
        if isinstance(implementation, dict) and implementation.get('status') == 'implemented':
            need(text(implementation.get('reference')), 'implemented action needs code reference: ' + action_id)
            op = operations.get(action.get('operation_id'), {})
            need(op.get('status') == 'supported', 'implemented action requires supported contract: ' + action_id)
    mapped_expectations = set()
    for assertion in assertions.values():
        refs(assertion.get('source_step_ids'), steps, 'assertion source steps', True)
        need(assertion.get('reader_action_id') in actions, 'assertion reader action unknown')
        reader = actions.get(assertion.get('reader_action_id'), {})
        if assertion.get('kind') in ['persisted-state', 'unchanged-state', 'integration-artifact']:
            need(reader.get('mutation') is False, 'independent state/artifact reader must be non-mutating')
        refs(assertion.get('variant_ids'), variants, 'assertion variants', True)
        need(assertion.get('kind') in ['response', 'persisted-state', 'integration-artifact', 'unchanged-state'], 'assertion kind invalid')
        need('expected' in assertion, 'assertion expectation required')
        ids = assertion.get('source_expectation_ids', [])
        refs(ids, expectations, 'assertion source_expectation_ids')
        for eid in ids if isinstance(ids, list) else []:
            if isinstance(eid, str) and eid in expectations:
                mapped_expectations.add(eid)
                need(expectations[eid] in assertion.get('source_step_ids', []), 'assertion expectation step mismatch')
    seen_steps = set()
    excluded_steps = set()
    for entry in coverage:
        if not isinstance(entry, dict):
            errors.append('coverage entry must be an object')
            continue
        step = entry.get('step_id')
        need(step in steps, 'coverage step unknown')
        seen_steps.add(step)
        disposition = entry.get('disposition')
        choices = {'action': actions, 'assertion': assertions, 'prerequisite': preconditions, 'gap': gaps, 'approved-exclusion': deviations, 'navigation': {}}
        need(disposition in choices, 'coverage disposition invalid')
        refs(entry.get('references'), choices.get(disposition, {}), 'coverage references', disposition != 'navigation')
        if disposition == 'navigation':
            need(text(entry.get('reason')), 'navigation needs reason')
            need(entry.get('references') == [], 'navigation cannot reference an API action')
        if disposition == 'approved-exclusion':
            d = deviations.get(entry.get('deviation_id'), {})
            need(d.get('status') == 'approved' and text(d.get('approval_ref')), 'exclusion needs approved deviation')
            if d.get('status') == 'approved' and text(d.get('approval_ref')):
                excluded_steps.add(step)
    need(seen_steps == set(steps), 'every source step needs coverage')
    for gap in gaps.values():
        if gap.get('status') == 'open':
            mapped_expectations.update(e for e in gap.get('expectation_ids', []) if isinstance(e, str))
    for eid, step_id in expectations.items():
        need(eid in mapped_expectations or step_id in excluded_steps, 'uncovered expected result: ' + eid)
    for check in checks:
        if not isinstance(check, dict):
            errors.append('validation entries must be objects')
            continue
        need(check.get('variant_id') in variants, 'validation variant unknown')
        need(check.get('result') in ['PASS', 'FAIL', 'UNVERIFIED', 'N/A', 'passed'], 'validation result invalid')
        need(text(check.get('type')), 'validation type required')
        if check.get('result') in ['PASS', 'FAIL', 'passed']:
            need(text(check.get('source_ref')), 'executed validation needs source_ref')
    stage = spec.get('status')
    need(stage in STAGES, 'invalid scenario stage')
    for variant_id, variant in variants.items():
        refs(variant.get('precondition_ids'), preconditions, 'variant preconditions')
        refs(variant.get('assertion_ids'), assertions, 'variant assertions', True)
        need(isinstance(variant.get('overrides'), dict), 'variant overrides required')
        vstage = variant.get('status')
        need(vstage in STAGES, 'invalid variant stage')
        if vstage not in STAGES:
            continue
        if STAGES.index(vstage) >= 1:
            need(all(a.get('implementation', {}).get('status') == 'implemented' for a in actions.values()), 'implemented stage requires implemented actions')
        if STAGES.index(vstage) >= 1:
            blocked = set(actions) | set(operations) | set(assertions)
            need(not any(g.get('status') == 'open' and
                         (set(g.get('target_ids', [])) & blocked or g.get('expectation_ids'))
                         for g in gaps.values()), 'implemented stage has unresolved implementation/acceptance gaps')
        if vstage in EVIDENCE:
            evidence_type = EVIDENCE[vstage]
            matching = [c for c in checks if isinstance(c, dict) and c.get('variant_id') == variant_id and c.get('type') == evidence_type and c.get('result') in ['PASS', 'passed'] and text(c.get('source_ref'))]
            need(bool(matching), vstage + ' needs ' + evidence_type + ' evidence for ' + variant_id)
        if stage in STAGES:
            need(STAGES.index(stage) <= STAGES.index(vstage), 'scenario stage exceeds variant stage')
    return errors


def main():
    if len(sys.argv) != 2:
        print('Usage: python3 validate_scenario.py <scenario.json>', file=sys.stderr)
        return 2
    try:
        spec = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
        errors = validate(spec)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print('Invalid scenario: ' + str(exc), file=sys.stderr)
        return 1
    if errors:
        print('\n'.join('FAIL: ' + e for e in errors), file=sys.stderr)
        return 1
    print('Scenario structure valid; API contracts, authorization and execution are not validated.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
