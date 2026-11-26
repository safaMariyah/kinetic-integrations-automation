import { readTargetProfile, applyTargetProfile, validateTargetProfile } from '../../src/config/profile';
import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment } from '../../src/config/environment';

test('explicit environment selection preserves injected values and fails on missing selection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kinetic-environment-'));
  const previous = process.env.TEST_ENV_FILE;
  const original = process.env.KINETIC_ENV_LOADER_CHECK;
  try {
    const file = join(directory, 'profile.env');
    writeFileSync(file, 'KINETIC_ENV_LOADER_CHECK=file-value');
    process.env.TEST_ENV_FILE = file;
    process.env.KINETIC_ENV_LOADER_CHECK = 'injected-value';
    loadEnvironment();
    expect(process.env.KINETIC_ENV_LOADER_CHECK).toBe('injected-value');
    delete process.env.KINETIC_ENV_LOADER_CHECK;
    loadEnvironment();
    expect(process.env.KINETIC_ENV_LOADER_CHECK).toBe('file-value');
    process.env.TEST_ENV_FILE = join(directory, 'missing.env');
    expect(() => loadEnvironment()).toThrow('TEST_ENV_FILE selects a missing file');
  } finally {
    if (previous === undefined) delete process.env.TEST_ENV_FILE; else process.env.TEST_ENV_FILE = previous;
    if (original === undefined) delete process.env.KINETIC_ENV_LOADER_CHECK; else process.env.KINETIC_ENV_LOADER_CHECK = original;
    rmSync(directory, {recursive: true});
  }
});

test('target profile supplies defaults and rejects conflicting targets or unsupported capabilities', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kinetic-target-profile-'));
  const keys = ['TEST_TARGET_PROFILE', 'EPICOR_BASE_URL', 'EPICOR_COMPANY', 'POC_PLANT', 'POC_FROM_WHSE'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    const file = join(directory, 'target.json');
    const profile = {name:'fixture', erpBaseUrl:'https://example.test/api', company:'EPIC06', plant:'MfgSys', sourceWarehouse:'CHI', allocationProfile:'epic06-mfgsys-chi'};
    writeFileSync(file, JSON.stringify(profile));
    for (const key of keys) delete process.env[key];
    process.env.TEST_TARGET_PROFILE = file;
    applyTargetProfile();
    expect(process.env.EPICOR_BASE_URL).toBe(profile.erpBaseUrl);
    expect(() => validateTargetProfile()).not.toThrow();
    process.env.EPICOR_COMPANY = 'OTHER';
    expect(() => validateTargetProfile()).toThrow('conflicts');
    writeFileSync(file, JSON.stringify({...profile, allocationProfile:'unvalidated'}));
    expect(() => readTargetProfile()).toThrow('Unsupported allocation profile');
    writeFileSync(file, JSON.stringify({...profile, password:'must-not-be-in-profile'}));
    expect(() => readTargetProfile()).toThrow('Keep secrets');
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    rmSync(directory, {recursive:true});
  }
});
