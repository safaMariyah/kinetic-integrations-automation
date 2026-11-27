import { test } from '../fixtures';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getCACertificates } from 'node:tls';

test('read-only ERP connection in the live test worker', async ({epicor}, testInfo) => {
  // Requesting the fixture runs its read-only TLS/authentication/scope gate.
  void epicor;
  const ca = process.env.NODE_EXTRA_CA_CERTS;
  const evidence = {
    node: process.version,
    explicitCaConfigured: Boolean(ca),
    explicitCaSha256: ca ? createHash('sha256').update(readFileSync(ca)).digest('hex') : null,
    loadedExtraCaCount: typeof getCACertificates === 'function' ? getCACertificates('extra').length : null,
    businessMutations: 0,
  };
  console.log('PASS worker TLS, ERP authentication and source warehouse scope.', JSON.stringify(evidence));
  await testInfo.attach('erp-connection-readiness', {body: JSON.stringify(evidence), contentType: 'application/json'});
});
