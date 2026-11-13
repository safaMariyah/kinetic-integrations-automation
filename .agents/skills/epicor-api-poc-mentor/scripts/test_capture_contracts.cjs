// Offline tests of the real TypeScript source using Node 24's built-in type stripping.
// Browser/network are mocked; this does not validate an installed Playwright browser.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function load(chromium = { launch() { throw Error('Browser forbidden in pure test'); } }, processMock = { argv: ['node', 'offline-test'] }, requireFn = require) {
  let source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, 'capture-contracts.ts'), 'utf8'));
  source = source.replace(/import \{ chromium[^;]*from '@playwright\/test';/, 'const chromium = injectedChromium;');
  source = source.replace(/import \* as (\w+) from '([^']+)';/g, 'const $1 = require("$2");');
  source = source.replace(/export /g, '');
  source += '\nmodule.exports = { redactJson, sanitizeUrl, parseArgs, infer, toJsonSchema, flatten, findFlows, buildOperations, templatePath, main };';
  const sandbox = { require: requireFn, module: { exports: {} }, injectedChromium: chromium, process: processMock,
    URL, console: { log() {}, warn() {}, error() {} }, setTimeout };
  vm.runInNewContext(source, sandbox, { filename: 'capture-contracts-stripped.js' });
  return sandbox.module.exports;
}
const helpers = load();
const plain = x => JSON.parse(JSON.stringify(x));

test('redacts nested secrets including structured secret values', () => {
  const result = helpers.redactJson({ password: 'secret-marker', data: [{ api_key: { value: 'marker' }, ok: 3 }] });
  assert.equal(JSON.stringify(result).includes('marker'), false);
  assert.equal(result.data[0].ok, 3);
});

test('decodes query names before redaction and removes URL credentials', () => {
  const value = helpers.sanitizeUrl('https://user:pw@example.invalid/api?%74oken=marker&order=4#fragment');
  assert.equal(value.includes('marker'), false);
  assert.equal(value.includes('user'), false);
  assert.equal(new URL(value).searchParams.get('order'), '4');
});

test('CLI validates scenario containment, values, options and auth URL', () => {
  const args = ['--scenario', 'case-1', '--base', 'https://example.invalid/app'];
  assert.equal(helpers.parseArgs(args).maxBody, 2000000);
  for (const extra of [['--max-body', '0'], ['--unknown', 'x'], ['--storage'], ['--base', 'https://else.invalid']]) {
    assert.throws(() => helpers.parseArgs([...args, ...extra]));
  }
  assert.throws(() => helpers.parseArgs(['--scenario', '../escape', '--base', 'https://example.invalid']));
  assert.throws(() => helpers.parseArgs(['--scenario', 'ok', '--base', 'https://user:pw@example.invalid']));
});

test('sample inference distinguishes observed presence from nullability', () => {
  let schema = helpers.infer({ value: 3, optional: 'x' });
  schema = helpers.infer({ value: null }, schema);
  const out = helpers.toJsonSchema(schema);
  assert.deepEqual(plain(out.required), ['value']);
  assert.equal(out.properties.value.nullable, true);
  assert.equal(helpers.flatten(schema).find(row => row.path === 'optional').observedRequired, false);
});

test('correlates repeated operations but excludes redaction placeholders', () => {
  const calls = [
    { step: '1', op: 'POST Save', url: '/api/Save', resBody: { id: 'run-123', token: '<redacted>' } },
    { step: '2', op: 'POST Save', url: '/api/Save', reqBody: { id: 'run-123', token: '<redacted>' } },
  ];
  const flows = helpers.findFlows(calls);
  assert.equal(flows.length, 1);
  assert.equal(flows[0].example, 'run-123');
});

test('path templates preserve operation structure and replace identities', () => {
  assert.equal(helpers.templatePath('/api/Parts(Company=\'X\',PartNum=\'Y\')/123'), '/api/Parts(Company={Company},PartNum={PartNum})/{id}');
});

test('help never launches browser', async () => {
  const h = load(undefined, { argv: ['node', 'offline-test', '--help'] });
  await h.main();
});


test('mocked lifecycle saves sanitized artifacts and retains approved TLS checks', async () => {
  const { EventEmitter } = require('node:events');
  const tempParent = fs.existsSync(require('node:os').tmpdir()) ? require('node:os').tmpdir() : process.cwd();
  const root = fs.mkdtempSync(path.join(tempParent, 'capture-offline-'));
  const context = new EventEmitter();
  const browser = new EventEmitter();
  const terminal = new EventEmitter();
  let contextOptions;
  context.newPage = async () => ({ goto: async () => {} });
  browser.newContext = async options => { contextOptions = options; return context; };
  browser.close = async () => {};
  let signalExit;
  const exit = new Promise(resolve => { signalExit = resolve; });
  const processMock = { argv: ['node', 'offline-test', '--scenario', 'fixture', '--base',
    'https://example.invalid/app?%74oken=base-marker', '--out', root], on() {}, exit: signalExit };
  const requireFn = id => id === 'node:readline' ? { createInterface: () => terminal } : require(id);
  try {
    const h = load({ launch: async () => browser }, processMock, requireFn);
    await h.main();
    assert.equal(contextOptions.ignoreHTTPSErrors, undefined);
    const req = { resourceType: () => 'xhr', method: () => 'POST',
      url: () => 'https://example.invalid/api/Save?%74oken=query-marker',
      allHeaders: async () => ({ 'content-type': 'application/json', authorization: 'Bearer auth-marker' }),
      postData: () => JSON.stringify({ password: 'body-marker', record: 'run-123' }) };
    context.emit('request', req);
    context.emit('response', { request: () => req, headers: () => ({ 'content-type': 'application/json' }),
      status: () => 200, text: async () => { await new Promise(r => setTimeout(r, 20)); return '{"id":"run-123"}'; } });
    terminal.emit('line', 'done');
    assert.equal(await exit, 0);
    const out = JSON.parse(fs.readFileSync(path.join(root, 'fixture', 'calls.json'), 'utf8'));
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].resBody.id, 'run-123');
    const all = fs.readdirSync(path.join(root, 'fixture')).map(name => fs.readFileSync(path.join(root, 'fixture', name), 'utf8')).join('');
    for (const secret of ['base-marker', 'query-marker', 'body-marker', 'auth-marker']) assert.equal(all.includes(secret), false);
    assert.ok(fs.existsSync(path.join(root, 'registry.json')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
