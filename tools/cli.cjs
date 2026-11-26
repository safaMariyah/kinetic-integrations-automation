// One TypeScript loader for maintained CLI commands; no credentials are logged.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, filename);
try { require('../src/config/environment.ts').loadEnvironment(); }
catch (error) { console.error(error.message); process.exit(1); }
const commands = {doctor: './doctor.ts', architecture: './architecture.ts', 'quickship-readiness': './quickshipReadiness.ts', live: './live.ts', 'quickship-refresh': './quickshipSession.ts'};
const command = commands[process.argv[2]];
if (!command) { console.error('Usage: node tools/cli.cjs doctor|architecture|quickship-readiness|quickship-refresh|live'); process.exitCode = 1; }
else Promise.resolve(require(command).run()).catch(() => { console.error('Command failed. Check configuration and file access; sensitive details withheld.'); process.exitCode = 1; });
