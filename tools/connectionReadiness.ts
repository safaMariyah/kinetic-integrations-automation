import { spawn, spawnSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { connect, getCACertificates } from 'node:tls';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readEpicorSettings } from '../src/config/epicor';

/** Same worker and fixtures as business tests, but no business operations. */
export async function run(): Promise<void> {
  const ca = process.env.NODE_EXTRA_CA_CERTS;
  console.log('Connection trust:', JSON.stringify({
    node: process.version,
    explicitCaConfigured: Boolean(ca),
    explicitCaSha256: ca ? createHash('sha256').update(readFileSync(ca)).digest('hex') : null,
    loadedExtraCaCount: typeof getCACertificates === 'function' ? getCACertificates('extra').length : null,
  }));
  // Credential-free native TLS comparison. Never disable certificate validation.
  const target = new URL(readEpicorSettings().baseUrl);
  await new Promise<void>(resolve => {
    const socket = connect({host: target.hostname, servername: target.hostname, port: Number(target.port || 443)}, () => {
      console.log('Native TLS: PASS; peer certificate SHA256:', socket.getPeerCertificate().fingerprint256);
      socket.destroy();
      resolve();
    });
    socket.setTimeout(10000, () => { console.log('Native TLS: timed out.'); socket.destroy(); resolve(); });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      const allowed = new Set(['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT',
        'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
        'ERR_TLS_CERT_ALTNAME_INVALID', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET']);
      console.log('Native TLS: FAIL;', allowed.has(error.code ?? '') ? error.code : 'unclassified connection error');
      resolve();
    });
  });
  if (process.platform === 'win32') {
    const probe = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      readFileSync(resolvePath('tools/inspect-erp-certificate.ps1'), 'utf8')], {
      env: process.env, encoding: 'utf8', windowsHide: true, timeout: 25000,
    });
    console.log('Windows peer certificate:', probe.stdout.trim() || 'Inspection unavailable.');
  }
  const trustArgs = process.platform === 'win32' && process.env.NODE_EXTRA_CA_CERTS && process.allowedNodeEnvironmentFlags.has('--use-system-ca')
    ? ['--no-use-system-ca'] : [];
  const child = spawn(process.execPath, [...trustArgs, require.resolve('@playwright/test/cli'),
    'test', '--project=readiness', '--workers=1', '--retries=0'], {stdio: 'inherit', env: process.env});
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}
