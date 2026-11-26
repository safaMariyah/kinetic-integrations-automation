import { checkpointSteps, type WorkflowProgress } from '../../src/support/workflow';
import { expect } from '@playwright/test';
import { test } from '../fixtures';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, unlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprintSources, fingerprintCoverage, replaceManifestFile, checkpointIdentities } from '../../src/support/runEvidence';

test('checkpoint summaries retain recovery IDs while withholding arbitrary payloads and malformed data', async ({}, testInfo) => {
  const progress = {orderNum:12,packNum:34,miscPackNum:56,masterPackNum:78,freightTransaction:'90',
    partNum:'APIPOC-1234567890abcdef1234567890abcdef',stage:'private stage',password:'private password',
    freightResponse:{token:'private token'},customerPartCode:'private code'};
  const body = Buffer.from(JSON.stringify(progress));
  // Exercise the real reporter too; these are synthetic identifiers, not an ERP run.
  await testInfo.attach('retained-run-identities', {body, contentType:'application/json'});
  const summary = checkpointIdentities('retained-identities-and-checkpoint', body);
  expect(summary).toEqual({orderNum:12,packNum:34,miscPackNum:56,masterPackNum:78,freightTransaction:'90',partNum:progress.partNum});
  expect(JSON.stringify(summary)).not.toContain('private');
  expect(checkpointIdentities('retained-run-identities-and-transitions', Buffer.from(JSON.stringify({progress})))).toEqual(summary);
  expect(checkpointIdentities('vat-run-intent-and-before-image', body)).toEqual({});
  for (const raw of ['not JSON','null','[]','{"orderNum":-1,"packNum":"34","freightTransaction":"secret","partNum":"private part"}']) {
    expect(checkpointIdentities('retained-run-identities', Buffer.from(raw))).toEqual({});
  }
});

test('source fingerprint includes untracked execution code and excludes private runtime material', () => {
  const root = mkdtempSync(join(tmpdir(), 'kinetic-fingerprint-'));
  try {
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, '.runtime'));
    writeFileSync(join(root, 'src', 'new.ts'), 'export const value = 1;');
    writeFileSync(join(root, '.runtime', 'config.json'), '{"secret":"first"}');
    writeFileSync(join(root, '.env'), 'SECRET=first');
    const first = fingerprintSources(root);
    expect(Object.keys(first.files)).toEqual(['src/new.ts']);
    writeFileSync(join(root, '.env'), 'SECRET=changed');
    expect(fingerprintSources(root).sha256).toBe(first.sha256);
    writeFileSync(join(root, 'src', 'new.ts'), 'export const value = 2;');
    expect(fingerprintSources(root).sha256).not.toBe(first.sha256);
  } finally { rmSync(root, {recursive: true}); }
});

test('automatic run context is attached without constructing live API fixtures', async ({}, testInfo) => {
  const context = testInfo.attachments.find(attachment => attachment.name === 'run-context');
  expect(context?.body).toBeDefined();
  const saved = JSON.parse(context!.body!.toString());
  expect(saved.runId).toBe(testInfo.config.metadata.runId);
  // The coordinator writes this file before workers start; a worker-generated ID has no manifest.
  const manifest = JSON.parse(readFileSync(join(process.env.KINETIC_PLAYWRIGHT_RUN_DIRECTORY!, 'manifest.json'), 'utf8'));
  expect(saved.runId).toBe(manifest.runId);
  expect(saved.testId).toBe(testInfo.testId);
  expect(saved.scenario).toBe(testInfo.title);
});

test('coverage provenance detects changed requirements without reading retained raw evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'kinetic-coverage-'));
  try {
    mkdirSync(join(root, 'resources', 'case', 'run-evidence'), {recursive:true});
    const file = join(root, 'resources', 'case', 'coverage.md');
    writeFileSync(file, Buffer.from([0x97, 0x41]));
    writeFileSync(join(root, 'resources', 'case', 'run-evidence', 'coverage.md'), 'private evidence');
    const initial = fingerprintCoverage(root);
    expect(Object.keys(initial)).toEqual(['resources/case/coverage.md']);
    writeFileSync(file, 'changed requirement');
    expect(fingerprintCoverage(root)).not.toEqual(initial);
  } finally { rmSync(root, {recursive:true}); }
});

test('workflow failure retains last completed step and never replays an uncertain action', async () => {
  const progress: WorkflowProgress = {stage:'start'};
  let attempts = 0;
  const run = checkpointSteps((name, action) => test.step(name, action), progress);
  await run('prepare', async () => {});
  await expect(run('save', async () => { attempts++; throw new Error('uncertain write'); })).rejects.toThrow('Last confirmed completed step: prepare');
  expect(progress.lastCompletedStage).toBe('prepare');
  expect(progress.failedStage).toBe('save');
  expect(attempts).toBe(1);
});
test('checkpoint output failure preserves business completion without classifying it as action failure', async () => {
  const progress: WorkflowProgress = {stage:'start'};
  const run = checkpointSteps(async (_name, action) => action(), progress, () => {throw new Error('disk unavailable');});
  await expect(run('save', async () => {})).rejects.toThrow('logging failed after save completed');
  expect(progress.lastCompletedStage).toBe('save');
  expect(progress.failedStage).toBeUndefined();
});

test('manifest replacement handles Windows rename sharing denial without dropping the completed document', () => {
 const directory = mkdtempSync(join(tmpdir(),'kinetic-manifest-'));
 try {
  const pending = join(directory,'manifest.json.tmp'), destination = join(directory,'manifest.json');
  writeFileSync(pending,'{"status":"passed"}'); writeFileSync(destination,'{"status":"running"}');
  const fallback = replaceManifestFile(pending,destination,{rename:()=>{throw Object.assign(new Error('sharing denial'),{code:'EPERM'});},copy:copyFileSync,unlink:unlinkSync});
  expect(fallback).toBe(true);
  expect(JSON.parse(readFileSync(destination,'utf8')).status).toBe('passed');
 } finally {rmSync(directory,{recursive:true});}
});
