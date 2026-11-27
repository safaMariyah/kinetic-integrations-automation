// One TypeScript loader for maintained CLI commands; no credentials are logged.
const fs = require('node:fs');
const startupExtraCA = process.env.NODE_EXTRA_CA_CERTS;
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, filename);
try { require('../src/config/environment.ts').loadEnvironment(); }
catch (error) { console.error(error.message); process.exit(1); }
// loadEnvFile runs after Node initializes TLS. Restart so a CA configured in
// the selected environment file is actually loaded, then inherited by workers.
// This Windows ERP certificate verifies with the explicit CA but fails when
// system-CA mode is enabled, even though Node enumerates the extra certificate.
const explicitCaMode = process.platform === 'win32' && process.allowedNodeEnvironmentFlags.has('--use-system-ca') &&
  process.env.NODE_EXTRA_CA_CERTS && !process.execArgv.includes('--no-use-system-ca');
if (process.env.NODE_EXTRA_CA_CERTS && (process.env.NODE_EXTRA_CA_CERTS !== startupExtraCA || explicitCaMode)) {
  if (!fs.existsSync(process.env.NODE_EXTRA_CA_CERTS)) {
    console.error('Configured NODE_EXTRA_CA_CERTS file is missing. No command was executed.');
    process.exit(1);
  }
  const result = require('node:child_process').spawnSync(process.execPath,
    [...process.execArgv, ...(explicitCaMode ? ['--no-use-system-ca'] : []), __filename, ...process.argv.slice(2)], {stdio: 'inherit', env: process.env});
  if (result.error) console.error('Could not start Node with the configured CA file.');
  process.exit(result.status ?? 1);
}
const commands = {'connection-readiness': './connectionReadiness.ts', doctor: './doctor.ts', architecture: './architecture.ts', 'quickship-readiness': './quickshipReadiness.ts', live: './live.ts', 'quickship-refresh': './quickshipSession.ts', 'erp-readiness': './erpReadiness.ts'};
const command = commands[process.argv[2]];
if (!command) { console.error('Usage: node tools/cli.cjs doctor|architecture|connection-readiness|quickship-readiness|quickship-refresh|erp-readiness|live'); process.exitCode = 1; }
else Promise.resolve(require(command).run()).catch(() => { console.error('Command failed. Check configuration and file access; sensitive details withheld.'); process.exitCode = 1; });
