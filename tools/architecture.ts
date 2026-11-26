import * as ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(directory, e.name)) : [join(directory, e.name)]))).flat();
}

/** Check resolved relative dependencies, including alternate module-loading syntax. */
export function inspectArchitecture(file: string, source: string): string[] {
  const violations: string[] = [];
  const normalized = file.replace(/\\/g, '/');
  const liveSpec = normalized.startsWith('tests/') && normalized.endsWith('.spec.ts') && !normalized.includes('/local/');
  let usesScenarioFixture = false;
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const dependency = (specifier: string, node: ts.Node) => {
    const target = specifier.startsWith('.') ? posix.normalize(posix.join(posix.dirname(normalized), specifier)) : specifier;
    const report = (message: string) => violations.push(`${file}:${syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line + 1}: ${message}`);
    if (target.startsWith('src/support/quickShip')) report('import QuickShip modules from integrations/quickship');
    if (normalized.startsWith('src/') && /^(tests|tools)\//.test(target)) report('production support must not depend on tests or tools');
    if (normalized.startsWith('src/config/') && target.startsWith('src/') && !target.startsWith('src/config/')) report('configuration must not depend on API, workflow or integration code');
    if (normalized.startsWith('src/api/') && /^src\/(flows|integrations)\//.test(target)) report('API adapters must not depend on workflows or integration orchestration');
    if (normalized.startsWith('src/integrations/') && target.startsWith('src/flows/')) report('integration adapters must not depend on scenario workflows');
    if (liveSpec && target.startsWith('tools/')) report('regression scenarios must not load discovery or CLI tools');
    if ((liveSpec || normalized.startsWith('src/')) && /^(?:playwright|playwright-core)(?:\/|$)/.test(specifier)) report('use API-only @playwright/test infrastructure; browser discovery belongs under tools/discovery');
    if ((liveSpec || normalized.startsWith('src/')) && specifier === '@playwright/test' && !ts.isImportDeclaration(node)) report('use static named Playwright imports so API-only dependencies can be reviewed');
  };
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) dependency(node.moduleSpecifier.text, node);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) dependency(node.moduleReference.expression.text, node);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) dependency(argument.text, node);
      else if (liveSpec || normalized.startsWith('src/')) violations.push(`${file}: module loading must use a literal path so dependency boundaries can be checked`);
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const path = node.moduleSpecifier.text;
      const bindings = node.importClause?.namedBindings;
      if (liveSpec && bindings && ts.isNamedImports(bindings)) {
        const names = bindings.elements.map(item => item.propertyName?.text ?? item.name.text);
        const target = path.startsWith('.') ? posix.normalize(posix.join(posix.dirname(normalized), path)) : path;
        if (names.includes('test') && target === 'tests/fixtures') usesScenarioFixture = true;
        if (names.includes('test') && path === '@playwright/test') violations.push(`${file}: import test from ../fixtures for automatic run evidence and lifecycle ownership`);
        if (names.some(name => ['createEpicorClient','createQuickShipReader'].includes(name)) || (path === '@playwright/test' && names.includes('request'))) violations.push(`${file}: use lifecycle fixtures for API contexts`);
      }
      if ((liveSpec || normalized.startsWith('src/')) && path === '@playwright/test') {
        if (node.importClause?.name || (bindings && ts.isNamespaceImport(bindings))) violations.push(`${file}: use static named Playwright imports so API-only dependencies can be reviewed`);
        if (bindings && ts.isNamedImports(bindings) && bindings.elements.some(e => ['chromium','firefox','webkit','Page','Browser','BrowserContext'].includes(e.propertyName?.text ?? e.name.text))) violations.push(`${file}: browser automation belongs in separate discovery tools`);
      }
    }
    if (liveSpec && ts.isStringLiteralLike(node) && node.text.includes('discovery.local.json')) violations.push(`${file}: use runtime configuration rather than discovery inputs`);
    if (liveSpec && ts.isBindingElement(node) && ts.isIdentifier(node.propertyName ?? node.name) && ['page','browser'].includes((node.propertyName ?? node.name).getText(syntax))) violations.push(`${file}: regression scenarios must stay API-only`);
    ts.forEachChild(node, visit);
  };
  visit(syntax);
  if (liveSpec && !usesScenarioFixture) violations.push(`${file}: live specs must import the shared test fixture`);
  return [...new Set(violations)];
}

/** Protect concrete boundaries during incremental migration; no file-count rules. */
export async function run() {
  const violations: string[] = [];
  for (const file of [...await files('src'), ...await files('tests'), ...await files('tools')].filter(f => f.endsWith('.ts'))) {
    violations.push(...inspectArchitecture(file, await readFile(file, 'utf8')));
  }
  for (const violation of violations) console.error(violation);
  if (violations.length) process.exitCode = 1;
  else console.log('PASS repository module boundaries');
}
