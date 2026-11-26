import * as ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(directory, e.name)) : [join(directory, e.name)]))).flat();
}

/** Protect concrete boundaries during incremental migration; no file-count rules. */
export async function run() {
  const violations: string[] = [];
  for (const file of [...await files('src'), ...await files('tests')].filter(f => f.endsWith('.ts'))) {
    const source = await readFile(file, 'utf8');
    const normalized = file.replace(/\\/g, '/');
    const liveSpec = normalized.endsWith('.spec.ts') && !normalized.includes('/local/');
    let usesScenarioFixture = false;
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
    for (const statement of syntax.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const path = statement.moduleSpecifier.text;
      const bindings = statement.importClause?.namedBindings;
      if (liveSpec && bindings && ts.isNamedImports(bindings)) {
        const importsTest = bindings.elements.some(item => (item.propertyName?.text ?? item.name.text) === 'test');
        if (importsTest && path === '../fixtures') usesScenarioFixture = true;
        if (importsTest && path === '@playwright/test') violations.push(`${file}: import test from ../fixtures for automatic run evidence and lifecycle ownership`);
      }
      if (path.includes('support/quickShip')) violations.push(`${file}: import QuickShip modules from integrations/quickship`);
      if (normalized.startsWith('src/integrations/') && /(?:^|\/)flows\//.test(path)) violations.push(`${file}: integration adapters must not depend on scenario workflows`);
    }

    if (normalized.startsWith('src/') && /from\s+['"][^'"]*tests\//.test(source)) violations.push(`${file}: production support must not import tests`);
    if (liveSpec && !usesScenarioFixture) violations.push(`${file}: live specs must import the shared test fixture`);
    if (liveSpec && /createEpicorClient|createQuickShipReader|discovery\.local\.json/.test(source)) violations.push(`${file}: use lifecycle fixtures and runtime configuration`);
    if (liveSpec && /\b(?:page|browser)\s*[,}]/.test(source)) violations.push(`${file}: regression scenarios must stay API-only`);
  }
  for (const violation of violations) console.error(violation);
  if (violations.length) process.exitCode = 1;
  else console.log('PASS repository module boundaries');
}
