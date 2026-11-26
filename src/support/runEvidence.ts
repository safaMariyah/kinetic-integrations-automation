import { readTargetProfile } from '../config/profile';
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult, TestStep } from '@playwright/test/reporter';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, renameSync, appendFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, relative, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Hash execution sources, including untracked files, without reading private runtime data. */
export function fingerprintSources(root: string): {sha256: string; files: Record<string, string>} {
  const files: Record<string, string> = {};
  const collect = (path: string) => {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, {withFileTypes: true})) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (entry.isFile() && /\.(ts|cjs|json)$/.test(entry.name)) {
        files[relative(root, file).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(file)).digest('hex');
      }
    }
  };
  for (const directory of ['src', 'tests', 'tools', 'config']) collect(join(root, directory));
  for (const name of ['playwright.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'AGENTS.md']) {
    if (existsSync(join(root, name))) files[name] = createHash('sha256').update(readFileSync(join(root, name))).digest('hex');
  }
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return {sha256: createHash('sha256').update(JSON.stringify(sorted)).digest('hex'), files: sorted};
}

function git(root: string, args: string[]): string | null {
  try { return execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); }
  catch { return null; }
}

/** Coverage is hashed as bytes, preserving legacy source encodings; no raw evidence is copied. */
export function fingerprintCoverage(root: string): Record<string, string> {
  const records: Record<string, string> = {};
  const collect = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const file = join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'run-evidence') collect(file);
      else if (entry.isFile() && ['coverage.md', 'scenario.json', 'scenario-spec.json', 'contract-record.json'].includes(entry.name)) {
        records[relative(root, file).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(file)).digest('hex');
      }
    }
  };
  collect(join(root, 'resources'));
  return Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b)));
}
function targetURL(value: string | undefined): string | null {
  try { const url = new URL(value ?? ''); return url.origin + url.pathname; } catch { return null; }
}

/** Expose only known recovery IDs from checkpoint attachments, never arbitrary payload fields. */
export function checkpointIdentities(name: string, body: Buffer): Record<string, string | number> {
  if (!['retained-run-identities', 'retained-identities-and-checkpoint', 'retained-run-identities-and-transitions'].includes(name)) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(body.toString('utf8')); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  let source = parsed as Record<string, unknown>;
  if (name === 'retained-run-identities-and-transitions') {
    if (!source.progress || typeof source.progress !== 'object' || Array.isArray(source.progress)) return {};
    source = source.progress as Record<string, unknown>;
  }
  const identities: Record<string, string | number> = {};
  for (const field of ['orderNum', 'orderLine', 'orderRelease', 'queueSeq', 'packNum', 'miscPackNum', 'masterPackNum']) {
    const value = source[field];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) identities[field] = value;
  }
  if (typeof source.freightTransaction === 'string' && /^[1-9]\d{0,19}$/.test(source.freightTransaction)) identities.freightTransaction = source.freightTransaction;
  if (typeof source.partNum === 'string' && /^(?:APIPOC-[a-f0-9]{32}|M1)$/i.test(source.partNum)) identities.partNum = source.partNum;
  return identities;
}

/** Windows readers can deny rename/delete sharing while still allowing file replacement. */
export function replaceManifestFile(temporary: string, destination: string,
  operations = {rename:renameSync, copy:copyFileSync, unlink:unlinkSync}): boolean {
  try { operations.rename(temporary,destination); return false; }
  catch (error) {
    if (!['EPERM','EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    // The complete pending document remains available if this fallback also fails.
    operations.copy(temporary,destination);
    operations.unlink(temporary);
    return true;
  }
}

/** Manifests retain provenance and outcomes, never credentials, payloads or console text. */
export default class RunEvidenceReporter implements Reporter {
  private readonly directory: string;
  private manifest: Record<string, unknown> = {};
  private results: Record<string, unknown>[] = [];
  constructor(options: {directory: string}) { this.directory = resolve(options.directory); }
  private event(type: string, fields: Record<string, unknown> = {}) {
    mkdirSync(this.directory, {recursive: true});
    appendFileSync(join(this.directory, 'events.jsonl'), JSON.stringify({
      schemaVersion: 1, runId: basename(this.directory), at: new Date().toISOString(), type, ...fields,
    }) + '\n');
  }
  private save() {
    mkdirSync(this.directory, {recursive: true});
    const file = join(this.directory, 'manifest.json');
    writeFileSync(file + '.tmp', JSON.stringify({...this.manifest, results: this.results}, null, 2));
    if (replaceManifestFile(file + '.tmp', file)) this.event('manifest-replacement-fallback');
  }
  onBegin(config: FullConfig, suite: Suite) {
    const root = process.cwd();
    const status = git(root, ['status', '--porcelain']);
    const selected = [...new Set(suite.allTests().map(test => test.parent.project()?.name))];
    this.manifest = {
      schemaVersion: 1, runId: basename(this.directory), startedAt: new Date().toISOString(), status: 'running',
      kind: process.argv.includes('--list') ? 'discovery' : selected.every(name => name === 'local') ? 'offline' : 'live',
      source: {commit: git(root, ['rev-parse', 'HEAD']), dirty: status === null ? null : status.length > 0, ...fingerprintSources(root)},
      coverage: {files: fingerprintCoverage(root), scope: 'Repository coverage/specification records; presence does not prove that every requirement ran.'},
      targetProfile: readTargetProfile() ?? null,
      runtime: {node: process.version, platform: process.platform}, projects: selected,
      targetVerification: 'Configured selection only; this manifest does not verify live connectivity or scope.',
      target: {erpURL: targetURL(process.env.EPICOR_BASE_URL), company: process.env.EPICOR_COMPANY ?? null,
        plant: process.env.POC_PLANT ?? null, workstation: process.env.EPICOR_WORKSTATION_ID ?? null,
        quickShipURL: targetURL(process.env.QUICKSHIP_BASE_URL)},
      policy: {workers: config.workers, configuredRetries: config.projects.map(p => ({project: p.name, retries: p.retries}))},
      evidence: {events: 'events.jsonl', html: 'html/index.html', junit: 'results.xml', testResults: 'test-results'},
      retention: {classification: selected.every(name => name === 'local') ? 'offline-diagnostic' : 'preserve-live-evidence', automaticLocalDeletion: false},
      limitations: 'Source fingerprint covers listed repository sources, not installed services, secrets, runtime overrides or ERP state. Console output is retained by configured Playwright reporters, not this manifest.',
    };
    this.save();
    this.event('run-started');
    console.log(`Run evidence: ${join(this.directory, 'manifest.json')}`);
  }
  onTestBegin(test: TestCase, result: TestResult) {
    this.event('test-started', {testId: test.id, title: test.titlePath(), retry: result.retry});
  }
  onStepBegin(test: TestCase, result: TestResult, step: TestStep) {
    if (step.category === 'test.step') this.event('step-started', {testId: test.id, retry: result.retry, step: step.titlePath()});
  }
  onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    if (step.category === 'test.step') this.event(step.error ? 'step-failed' : 'step-completed', {
      testId: test.id, retry: result.retry, step: step.titlePath(), durationMs: step.duration,
    });
  }
  onTestEnd(test: TestCase, result: TestResult) {
    this.event('test-finished', {testId: test.id, status: result.status, retry: result.retry});
    this.results.push({testId: test.id, title: test.titlePath(), file: relative(process.cwd(), test.location.file),
      line: test.location.line, expectedStatus: test.expectedStatus, status: result.status, retry: result.retry,
      attachments: result.attachments.map(a => ({name: a.name, contentType: a.contentType, path: a.path ? relative(this.directory, a.path) : null,
        ...(a.body ? {bodyBytes: a.body.length, bodySha256: createHash('sha256').update(a.body).digest('hex'),
          recoveryIdentities: checkpointIdentities(a.name, a.body)} : {}),
      }))});
    this.save();
  }
  onEnd(result: FullResult) {
    const initialSource = this.manifest.source as {sha256?: string} | undefined;
    const finalFingerprint = fingerprintSources(process.cwd()).sha256;
    this.manifest.sourceAtEnd = {sha256: finalFingerprint, changedDuringRun: initialSource?.sha256 !== finalFingerprint};
    const coverage = fingerprintCoverage(process.cwd());
    this.manifest.coverageAtEnd = {files: coverage, changedDuringRun: JSON.stringify((this.manifest.coverage as {files: unknown}).files) !== JSON.stringify(coverage)};
    this.event('run-finished', {status: result.status});
    this.manifest.status = result.status;
    this.manifest.finishedAt = new Date().toISOString();
    this.save();
  }
}
