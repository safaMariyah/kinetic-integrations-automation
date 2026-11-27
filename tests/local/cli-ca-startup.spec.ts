import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getCACertificates, rootCertificates } from 'node:tls';
import { spawnSync } from 'node:child_process';

test('CLI loads a CA selected by the environment file at actual Node startup', () => {
  test.skip(typeof getCACertificates !== 'function', 'Node cannot enumerate loaded extra CA certificates.');
  const directory = mkdtempSync(join(tmpdir(), 'kinetic-cli-ca-'));
  try {
    const ca = join(directory, 'public-test-ca.pem');
    const envFile = join(directory, 'test.env');
    // Public bundled root; no private keys, external connections or OS changes.
    writeFileSync(ca, rootCertificates[0]);
    writeFileSync(envFile, `NODE_EXTRA_CA_CERTS=${ca.replace(/\\/g, '/')}\n`);
    const env: NodeJS.ProcessEnv = {...process.env, TEST_ENV_FILE: envFile};
    delete env.NODE_EXTRA_CA_CERTS;
    const windowsSystemCa = process.platform === 'win32' && process.allowedNodeEnvironmentFlags.has('--use-system-ca');
    if (windowsSystemCa) env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --use-system-ca`.trim();
    const result = spawnSync(process.execPath, [resolve('tools/cli.cjs'), 'doctor'], {env, encoding: 'utf8', timeout: 20000});
    expect(result.error).toBeUndefined();
    expect(result.stdout).toContain('PASS NODE_EXTRA_CA_CERTS certificate loaded at Node startup');
    if (windowsSystemCa) expect(result.stdout).toContain('PASS Explicit Windows CA mode active');
    expect(result.stderr).not.toContain('Ignoring extra certs');
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
