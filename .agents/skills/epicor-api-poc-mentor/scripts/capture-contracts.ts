/**
 * capture-contracts.ts
 *
 * Records the API calls the app makes while a human performs a
 * scenario, attributes every call to the step that caused it, redacts secrets,
 * infers request/response schemas, detects value flows between steps, and writes:
 *
 *   contracts/<scenario>/calls.json       every sanitized call, in order, tagged by step
 *   contracts/<scenario>/contracts.json   one entry per operation: schema + sample + steps
 *   contracts/<scenario>/contracts.md     step -> operation map + flows (read this first)
 *   contracts/<scenario>/fields.csv       flat field list, opens in Excel
 *   contracts/registry.json               index of every operation ever captured
 *
 * Setup (once):
 *   npm i -D @playwright/test tsx typescript @types/node
 *   npx playwright install chromium
 *
 * Run:
 *   npx tsx scripts/capture-contracts.ts --scenario intl-contact --base https://your-app-host/path \
 *        [--api-pattern "/api/"] [--storage auth.json] [--save-auth auth.json] [--out contracts]
 *
 * While it runs, the browser is visible. In the terminal:
 *   - type a step label (e.g. "5 click Save") and press Enter BEFORE performing that step
 *   - type "done" when finished
 * Log in manually in the browser the first time; use --save-auth to reuse the session.
 * Never commit the auth file.
 */
import { chromium, type Request, type Response } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

// ---------- types ----------
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface S {
  types: string[];
  n: number;
  objN: number;
  props?: Record<string, S>;
  seen?: Record<string, number>;
  items?: S;
  examples?: Array<string | number | boolean>;
}

export interface Call {
  seq: number;
  step: string;
  method: string;
  op: string;
  template: string;
  url: string;
  query: Record<string, string>;
  status: number;
  ms: number;
  auth: string[];
  customHeaders: string[];
  reqContentType: string;
  reqBody?: Json;
  resBody?: Json;
  note?: string;
}

export interface Row {
  path: string;
  type: string;
  observedRequired: boolean;
  nullable: boolean;
  example: string;
}

export interface Flow {
  fromStep: string;
  fromOp: string;
  fromPath: string;
  toStep: string;
  toOp: string;
  to: string;
  example: string;
  count: number;
  likelyConstant: boolean;
}

// ---------- pure helpers (exported for tests) ----------
const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|ssn/i;

export function redactJson(v: Json, key = ''): Json {
  if (SENSITIVE_KEY.test(key)) return '<redacted>';
  if (Array.isArray(v)) return v.map((x) => redactJson(x, key));
  if (v && typeof v === 'object') {
    const o: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v)) o[k] = redactJson(x, k);
    return o;
  }
  return v;
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Collapse ids into placeholders: /orders/8841 -> /orders/{id}; Entity(Company='A',Num=5) -> Entity(Company={Company},Num={Num}) */
export function templatePath(rawPath: string): string {
  return safeDecode(rawPath)
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => {
      const parts = inner.split(',').map((kv) => {
        const i = kv.indexOf('=');
        if (i < 0) return '{key}';
        const k = kv.slice(0, i).trim();
        return `${k}={${k}}`;
      });
      return `(${parts.join(',')})`;
    })
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$|\()/gi, '/{guid}')
    .replace(/\/\d+(?=\/|$)/g, '/{id}');
}

function typeOf(v: Json): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/** Fold one JSON sample into a running schema. Call repeatedly to merge samples. */
export function infer(v: Json, s: S = { types: [], n: 0, objN: 0 }): S {
  s.n++;
  const t = typeOf(v);
  if (!s.types.includes(t)) s.types.push(t);
  if (t === 'object') {
    s.objN++;
    s.props ??= {};
    s.seen ??= {};
    for (const [k, x] of Object.entries(v as { [k: string]: Json })) {
      s.props[k] = infer(x, s.props[k]);
      s.seen[k] = (s.seen[k] ?? 0) + 1;
    }
  } else if (t === 'array') {
    for (const x of v as Json[]) s.items = infer(x, s.items);
  } else if (v !== null) {
    s.examples ??= [];
    const prim = v as string | number | boolean;
    if (s.examples.length < 3 && !s.examples.includes(prim)) s.examples.push(prim);
  }
  return s;
}

export function toJsonSchema(s: S): Record<string, unknown> {
  const nonNull = s.types.filter((t) => t !== 'null');
  const out: Record<string, unknown> = {
    type: nonNull.length === 0 ? 'null' : nonNull.length === 1 ? nonNull[0] : nonNull,
  };
  if (s.types.includes('null') && nonNull.length) out.nullable = true;
  if (s.props) {
    out.properties = Object.fromEntries(Object.entries(s.props).map(([k, c]) => [k, toJsonSchema(c)]));
    out.required = Object.keys(s.props).filter((k) => s.seen![k] === s.objN);
  }
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.examples?.length) out.examples = s.examples;
  out['x-samples'] = s.n;
  return out;
}

export function flatten(s: S, p = '', req = true, out: Row[] = []): Row[] {
  if (p) {
    out.push({
      path: p,
      type: s.types.filter((t) => t !== 'null').join('|') || 'null',
      observedRequired: req,
      nullable: s.types.includes('null'),
      example: s.examples?.[0] !== undefined ? String(s.examples[0]).slice(0, 60) : '',
    });
  }
  if (s.props) {
    for (const [k, c] of Object.entries(s.props)) {
      flatten(c, p ? `${p}.${k}` : k, s.seen![k] === s.objN, out);
    }
  }
  if (s.items) flatten(s.items, `${p}[]`, true, out);
  return out;
}

/** Shorten a body for samples: first 3 array items, strings capped at 200 chars. */
export function trim(v: Json): Json {
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '...' : v;
  if (Array.isArray(v)) return v.slice(0, 3).map(trim);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)]));
  }
  return v;
}

export function leaves(v: Json, p = '$'): Array<[string, string | number]> {
  if (Array.isArray(v)) return v.flatMap((x, i) => leaves(x, `${p}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => leaves(x, `${p}.${k}`));
  if (typeof v === 'string' || typeof v === 'number') return [[p, v]];
  return [];
}

const normPath = (p: string) => p.replace(/\[\d+\]/g, '[*]');

/** Find response values that reappear in a later request (URL or body): the correlation map. */
export function findFlows(calls: Call[]): Flow[] {
  const map = new Map<string, Flow>();
  for (let i = 0; i < calls.length; i++) {
    const src = calls[i];
    if (src.resBody === undefined) continue;
    const srcLeaves = leaves(src.resBody).filter(([, v]) => String(v).length >= 3 && v !== '<redacted>');
    for (let j = i + 1; j < calls.length; j++) {
      const dst = calls[j];
      const dstUrl = safeDecode(dst.url);
      const dstLeaves = dst.reqBody === undefined ? [] : leaves(dst.reqBody);
      for (const [sp, sv] of srcLeaves) {
        const sval = String(sv);
        const locs: string[] = [];
        if (sval.length >= 4 && dstUrl.includes(sval)) locs.push('url');
        for (const [dp, dv] of dstLeaves) if (String(dv) === sval) locs.push(`body:${normPath(dp)}`);
        for (const loc of locs) {
          const key = `${src.op}|${normPath(sp)}|${dst.op}|${loc}`;
          const f = map.get(key);
          if (f) f.count++;
          else {
            map.set(key, {
              fromStep: src.step,
              fromOp: src.op,
              fromPath: normPath(sp),
              toStep: dst.step,
              toOp: dst.op,
              to: loc,
              example: sval.slice(0, 40),
              count: 1,
              likelyConstant: false,
            });
          }
        }
      }
    }
  }
  const flows = [...map.values()];
  const fanout = new Map<string, Set<string>>();
  for (const f of flows) {
    const k = `${f.fromOp}|${f.fromPath}`;
    if (!fanout.has(k)) fanout.set(k, new Set());
    fanout.get(k)!.add(f.toOp);
  }
  for (const f of flows) f.likelyConstant = (fanout.get(`${f.fromOp}|${f.fromPath}`)?.size ?? 0) >= 4;
  return flows;
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseBody(text: string | null | undefined, ct: string): Json | undefined {
  if (!text) return undefined;
  if (/json/i.test(ct) || /^\s*[[{]/.test(text)) {
    try {
      return JSON.parse(text) as Json;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const STANDARD_HEADERS = new Set([
  'host', 'connection', 'accept', 'accept-encoding', 'accept-language', 'user-agent', 'referer', 'origin',
  'content-length', 'content-type', 'cookie', 'authorization', 'cache-control', 'pragma', 'priority', 'dnt',
  'upgrade-insecure-requests', 'if-none-match', 'if-modified-since', 'x-requested-with',
]);

function classifyHeaders(h: Record<string, string>): { auth: string[]; custom: string[] } {
  const auth: string[] = [];
  const a = h['authorization'];
  if (a) auth.push(/^bearer/i.test(a) ? 'Bearer' : /^basic/i.test(a) ? 'Basic' : 'Authorization');
  if (h['x-api-key']) auth.push('x-api-key');
  if (h['cookie']) auth.push('Cookie');
  const custom = Object.keys(h).filter((k) => !STANDARD_HEADERS.has(k) && !k.startsWith('sec-') && k !== 'x-api-key');
  return { auth, custom };
}

// ---------- aggregation ----------
interface Op {
  key: string;
  method: string;
  pathTemplate: string;
  steps: string[];
  statuses: number[];
  auth: string[];
  customHeaders: string[];
  calls: number;
  query: Record<string, { examples: string[] }>;
  reqContentTypes: string[];
  reqSchema?: S;
  reqSample?: Json;
  responses: Record<string, { schema: S; sample: Json }>;
}

const addUnique = <T>(arr: T[], v: T) => {
  if (!arr.includes(v)) arr.push(v);
};

export function buildOperations(calls: Call[]): Op[] {
  const map = new Map<string, Op>();
  for (const c of calls) {
    let op = map.get(c.op);
    if (!op) {
      op = {
        key: c.op, method: c.method, pathTemplate: c.template, steps: [], statuses: [], auth: [],
        customHeaders: [], calls: 0, query: {}, reqContentTypes: [], responses: {},
      };
      map.set(c.op, op);
    }
    op.calls++;
    addUnique(op.steps, c.step);
    addUnique(op.statuses, c.status);
    c.auth.forEach((a) => addUnique(op!.auth, a));
    c.customHeaders.forEach((h) => addUnique(op!.customHeaders, h));
    if (c.reqContentType) addUnique(op.reqContentTypes, c.reqContentType);
    for (const [k, v] of Object.entries(c.query)) {
      op.query[k] ??= { examples: [] };
      if (op.query[k].examples.length < 3) addUnique(op.query[k].examples, v);
    }
    if (c.reqBody !== undefined) {
      op.reqSchema = infer(c.reqBody, op.reqSchema);
      op.reqSample ??= trim(c.reqBody);
    }
    if (c.resBody !== undefined) {
      const k = String(c.status);
      const prev = op.responses[k];
      op.responses[k] = {
        schema: infer(c.resBody, prev?.schema),
        sample: prev?.sample ?? trim(c.resBody),
      };
    }
  }
  return [...map.values()];
}

function renderMarkdown(scenario: string, base: string, steps: { label: string }[], calls: Call[], ops: Op[], flows: Flow[]): string {
  const L: string[] = [];
  L.push(`# Captured contracts: ${scenario}`, '', `Base: ${base}`, `Calls captured: ${calls.length}, operations: ${ops.length}`, '');
  L.push('## Step to operation map', '', '| Step | Method + path | Status | Auth |', '|---|---|---|---|');
  for (const c of calls) L.push(`| ${c.step} | ${c.op} | ${c.status} | ${c.auth.join(', ') || '-'} |`);
  L.push('', '## Value flows (response value reused in a later request)', '');
  const real = flows.filter((f) => !f.likelyConstant);
  if (real.length === 0) L.push('None detected.');
  else {
    L.push('| From step | From (op, path) | To step | To (op, location) | Example | Seen |', '|---|---|---|---|---|---|');
    for (const f of real) L.push(`| ${f.fromStep} | ${f.fromOp} ${f.fromPath} | ${f.toStep} | ${f.toOp} ${f.to} | ${f.example} | ${f.count} |`);
  }
  const consts = flows.filter((f) => f.likelyConstant);
  if (consts.length) L.push('', `Likely constants (same value sent to 4+ operations, e.g. company or site): ${[...new Set(consts.map((f) => f.fromPath))].join(', ')}`);
  L.push('', '## Operations', '');
  for (const o of ops) {
    L.push(`### ${o.key}`, `- Steps: ${o.steps.join('; ')}`, `- Statuses seen: ${o.statuses.join(', ')}`, `- Auth: ${o.auth.join(', ') || '-'}`);
    if (o.customHeaders.length) L.push(`- Custom headers (names only): ${o.customHeaders.join(', ')}`);
    if (Object.keys(o.query).length) L.push(`- Query params: ${Object.keys(o.query).join(', ')}`);
    L.push('');
  }
  L.push('## Reading this correctly', '',
    '- Everything here is OBSERVED from one run. "required" means present in every sample seen, not that the API enforces it.',
    '- Anything not exercised (error statuses, optional fields) is absent. Capture a second run for negatives.',
    `- Steps recorded: ${steps.map((s) => s.label).join(' | ')}`);
  return L.join('\n');
}

function renderCsv(ops: Op[]): string {
  const rows: string[][] = [['operation', 'direction', 'status', 'location', 'path', 'type', 'observed_required', 'nullable', 'example']];
  for (const o of ops) {
    for (const [k, q] of Object.entries(o.query)) rows.push([o.key, 'request', '', 'query', k, 'string', '', '', q.examples[0] ?? '']);
    if (o.reqSchema) for (const r of flatten(o.reqSchema)) rows.push([o.key, 'request', '', 'body', r.path, r.type, String(r.observedRequired), String(r.nullable), r.example]);
    for (const [status, res] of Object.entries(o.responses)) {
      for (const r of flatten(res.schema)) rows.push([o.key, 'response', status, 'body', r.path, r.type, String(r.observedRequired), String(r.nullable), r.example]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

// ---------- CLI ----------
interface Args {
  scenario: string;
  base: string;
  apiPattern: RegExp;
  storage?: string;
  saveAuth?: string;
  out: string;
  maxBody: number;
}

export function sanitizeUrl(raw: string): string {
  const u = new URL(raw);
  u.username = '';
  u.password = '';
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (SENSITIVE_KEY.test(key)) u.searchParams.set(key, '<redacted>');
  }
  return u.toString();
}

export function parseArgs(argv: string[]): Args {
  const allowed = new Set(['scenario', 'base', 'api-pattern', 'storage', 'save-auth', 'out', 'max-body']);
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (!argv[i].startsWith('--') || !allowed.has(key) || !value || value.startsWith('--') || values.has(key)) {
      throw new Error('Invalid, duplicate or missing capture option');
    }
    values.set(key, value);
  }
  const scenario = values.get('scenario');
  const base = values.get('base');
  if (!scenario || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(scenario) || !base) {
    throw new Error('Provide --scenario (letters, digits, underscores, hyphens) and --base');
  }
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Base must be HTTP(S) without embedded credentials');
  }
  const maxBody = Number(values.get('max-body') ?? '2000000');
  if (!Number.isSafeInteger(maxBody) || maxBody <= 0) throw new Error('max-body must be a positive integer');
  return { scenario, base, apiPattern: new RegExp(values.get('api-pattern') ?? '/api/'),
    storage: values.get('storage'), saveAuth: values.get('save-auth'),
    out: values.get('out') ?? 'contracts', maxBody };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: capture-contracts.ts --scenario <name> --base <url> [--api-pattern <regex>] [--storage <file>] [--save-auth <file>] [--out <directory>] [--max-body <positive-chars>]');
    return;
  }
  const a = parseArgs(process.argv.slice(2));
  const safeBase = sanitizeUrl(a.base);
  if (a.storage && !fs.existsSync(a.storage)) throw new Error('Requested auth state file does not exist');
  const outDir = path.join(a.out, a.scenario);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: a.storage && fs.existsSync(a.storage) ? a.storage : undefined,
    viewport: null,
  });
  const page = await context.newPage();

  let step = '0-setup';
  const steps: { label: string; startedAt: string }[] = [{ label: step, startedAt: new Date().toISOString() }];
  const pending = new WeakMap<Request, { step: string; t0: number; seq: number }>();
  const calls: Call[] = [];
  let seq = 0;

  // Attribute by the step active when the REQUEST starts, not when the response lands.
  context.on('request', (req) => {
    pending.set(req, { step, t0: Date.now(), seq: ++seq });
  });

  const inFlight = new Set<Promise<void>>();
  let accepting = true;
  const recordResponse = async (resp: Response) => {
    const req = resp.request();
    try {
      if (!['xhr', 'fetch'].includes(req.resourceType()) || req.method() === 'OPTIONS') return;
      const u = new URL(req.url());
      if (!a.apiPattern.test(u.pathname)) return;
      const meta = pending.get(req) ?? { step, t0: Date.now(), seq: ++seq };

      const headers = await req.allHeaders();
      const { auth, custom } = classifyHeaders(headers);
      const reqCt = headers['content-type'] ?? '';
      const resCt = resp.headers()['content-type'] ?? '';

      let note: string | undefined;
      let reqBody: Json | undefined;
      const post = req.postData();
      if (post && post.length > a.maxBody) note = 'request too large, not parsed';
      else if (post) {
        reqBody = parseBody(post, reqCt);
        if (reqBody === undefined) note = `non-JSON request body omitted (${reqCt || 'unknown type'}, ${post.length} chars)`;
      }

      let resBody: Json | undefined;
      const text = await resp.text().catch(() => '');
      if (text.length > a.maxBody) note = `${note ? note + '; ' : ''}response too large (${text.length} chars), not parsed`;
      else resBody = parseBody(text, resCt);

      const query: Record<string, string> = {};
      u.searchParams.forEach((v, k) => {
        query[k] = SENSITIVE_KEY.test(k) ? '<redacted>' : v.slice(0, 200);
      });

      const method = req.method();
      const template = templatePath(u.pathname);
      calls.push({
        seq: meta.seq, step: meta.step, method, op: `${method} ${template}`, template,
        url: (() => { const safe = new URL(sanitizeUrl(u.toString())); return safe.pathname + safe.search; })(),
        query, status: resp.status(), ms: Date.now() - meta.t0, auth, customHeaders: custom,
        reqContentType: reqCt.split(';')[0], note,
        reqBody: reqBody === undefined ? undefined : redactJson(reqBody),
        resBody: resBody === undefined ? undefined : redactJson(resBody),
      });
      console.log(`  [${meta.step}] ${method} ${template} -> ${resp.status()}`);
    } catch {
      console.warn('A call could not be captured; its request/response is unverified.');
    }
  };
  context.on('response', (resp: Response) => {
    if (!accepting) return;
    const task = recordResponse(resp);
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  });

  await page.goto(a.base);
  console.log(`\nScenario "${a.scenario}". Log in if needed.`);
  console.log('Type a step label + Enter BEFORE each step. Type "done" to finish.\n');

  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    accepting = false;
    // Freeze the capture boundary and drain response handlers already started.
    const drained = await Promise.race([
      Promise.allSettled([...inFlight]).then(() => true),
      new Promise<boolean>((resolve) => { const timer = setTimeout(() => resolve(false), 10000); timer.unref(); }),
    ]);
    if (!drained) throw new Error('Capture response drain timed out; incomplete output was not saved');
    calls.sort((x, y) => x.seq - y.seq);
    const ops = buildOperations(calls);
    const flows = findFlows(calls);

    fs.writeFileSync(path.join(outDir, 'calls.json'), JSON.stringify({ scenario: a.scenario, steps, calls }, null, 2));
    fs.writeFileSync(
      path.join(outDir, 'contracts.json'),
      JSON.stringify({
        scenario: a.scenario, capturedAt: new Date().toISOString(), base: safeBase, steps,
        operations: ops.map((o) => ({
          key: o.key, method: o.method, pathTemplate: o.pathTemplate, steps: o.steps, statuses: o.statuses,
          auth: o.auth, customHeaders: o.customHeaders, calls: o.calls, query: o.query,
          request: o.reqSchema ? { contentTypes: o.reqContentTypes, schema: toJsonSchema(o.reqSchema), sample: o.reqSample } : undefined,
          responses: Object.fromEntries(Object.entries(o.responses).map(([k, r]) => [k, { schema: toJsonSchema(r.schema), sample: r.sample }])),
        })),
        flows,
      }, null, 2),
    );
    fs.writeFileSync(path.join(outDir, 'contracts.md'), renderMarkdown(a.scenario, safeBase, steps, calls, ops, flows));
    fs.writeFileSync(path.join(outDir, 'fields.csv'), renderCsv(ops));

    const regPath = path.join(a.out, 'registry.json');
    const reg: { operations: Record<string, { scenarios: string[]; statuses: number[]; auth: string[]; lastCaptured: string }> } =
      fs.existsSync(regPath) ? JSON.parse(fs.readFileSync(regPath, 'utf8')) : { operations: {} };
    for (const o of ops) {
      const e = (reg.operations[o.key] ??= { scenarios: [], statuses: [], auth: [], lastCaptured: '' });
      addUnique(e.scenarios, a.scenario);
      o.statuses.forEach((s) => addUnique(e.statuses, s));
      o.auth.forEach((x) => addUnique(e.auth, x));
      e.lastCaptured = new Date().toISOString();
    }
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));

    if (a.saveAuth) {
      try {
        await context.storageState({ path: a.saveAuth });
      } catch {
        console.warn('Could not save auth state (browser already closed). Use "done" instead of closing the window.');
      }
    }
    console.log(`\nWrote ${outDir}/ (contracts.md, contracts.json, fields.csv, calls.json) and ${regPath}`);
    console.log('Review contracts.md for anything sensitive before sharing it.');
    await browser.close().catch(() => undefined);
    process.exit(0);
  };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (line) => {
    const l = line.trim();
    if (!l) return;
    if (l.toLowerCase() === 'done') {
      void finish().catch(() => { console.error('Capture finalization failed; outputs may be incomplete.'); process.exit(1); });
      return;
    }
    step = l;
    steps.push({ label: l, startedAt: new Date().toISOString() });
    console.log(`-> step: ${l}`);
  });
  browser.on('disconnected', () => { void finish().catch(() => { console.error('Capture finalization failed; outputs may be incomplete.'); process.exit(1); }); });
  process.on('SIGINT', () => { void finish().catch(() => { console.error('Capture finalization failed; outputs may be incomplete.'); process.exit(1); }); });
}

if (process.argv[1] && /capture-contracts/.test(process.argv[1])) {
  main().catch(() => {
    console.error('Capture failed; check arguments, local files, browser setup and approved connectivity. No raw error is logged.');
    process.exit(1);
  });
}
