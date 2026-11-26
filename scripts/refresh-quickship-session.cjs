const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
(async () => {
  // Match API commands: injected settings take precedence and TEST_ENV_FILE is optional.
  require('../src/config/environment.ts').loadEnvironment();
  const required = name => { const value = process.env[name]?.trim(); if (!value) throw Error('Missing ' + name); return value; };
  const baseURL = required('QUICKSHIP_BASE_URL');
  const registration = required('QUICKSHIP_REGISTRATION_CODE');
  const state = path.resolve(required('QUICKSHIP_STORAGE_STATE'));
  const companyId = required('QUICKSHIP_COMPANY_ID');
  const companyName = required('EPICOR_COMPANY');
  if (companyName !== 'EPIC06' || new URL(baseURL).origin !== baseURL) throw Error('Expected exact EPIC06 scope and origin.');
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: false });
    // Login-only allowlist prevents shipment navigation and business writes.
    await context.route('**/*', async route => {
      const r = route.request(); const u = new URL(r.url());
      if (u.origin !== baseURL || (u.pathname.startsWith('/api/') && !['GET','HEAD','OPTIONS'].includes(r.method()) && !u.pathname.toLowerCase().startsWith('/api/authentication/'))) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(baseURL + '/dist/#/home');
    console.log('Complete QuickShip login in the browser. Waiting up to 5 minutes for EPIC06 readiness.');
    const deadline = Date.now() + 300000;
    let ready = false;
    while (Date.now() < deadline && !page.isClosed()) {
      const r = await context.request.get(baseURL + '/api/company/getCompany', { headers: { registrationcode: registration }, maxRetries: 0, maxRedirects: 0 });
      if (r.status() === 200) {
        const b = await r.json();
        if (b.isSuccess === true && b.result?.companyId === companyId && b.result?.companyName === companyName) { ready = true; break; }
        throw Error('QuickShip company scope mismatch.');
      }
      if (![401,403].includes(r.status())) throw Error('Readiness HTTP ' + r.status());
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (!ready) throw Error('Interactive login did not establish readiness.');
    fs.mkdirSync(path.dirname(state), { recursive: true });
    await context.storageState({ path: state, indexedDB: true });
    const { createQuickShipReader } = require('../src/support/quickShipReader.ts');
    const reader = await createQuickShipReader(baseURL, registration, state);
    try { await reader.verifyScope(companyId, companyName); } finally { await reader.dispose(); }
    console.log('PASS: saved refreshed session to ' + state);
    console.log('PASS: existing API reader verified EPIC06 using saved session cookies plus registrationcode.');
  } finally { await browser.close(); }
})().catch(() => { console.error('QuickShip refresh/readiness failed; no session contents logged.'); process.exitCode = 1; });
