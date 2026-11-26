import { test, expect } from '@playwright/test';
import { inspectArchitecture } from '../../tools/architecture';

for (const [name, source] of [
  ['import', "import type { Input } from '../flows/example';"],
  ['re-export', "export { run } from '../flows/example';"],
  ['require', "const example = require('../flows/example');"],
  ['dynamic import', "const example = import('../flows/example');"],
  ['import assignment', "import example = require('../flows/example');"],
  ['normalized path', "export * from '../api/../flows/example';"],
]) {
  test(`API boundary cannot be bypassed by ${name}`, () => {
    expect(inspectArchitecture('src/api/example.ts', source).join('\n')).toContain('API adapters must not depend on workflows');
  });
}

test('configuration and integration dependencies keep their direction', () => {
  expect(inspectArchitecture('src/config/example.ts', "export * from '../api/baseClient';").join('\n')).toContain('configuration must not depend');
  expect(inspectArchitecture('src/integrations/example.ts', "const run = require('../flows/example');").join('\n')).toContain('integration adapters must not depend');
  expect(inspectArchitecture('src/api/example.ts', "export * from '../../tests/fixtures';").join('\n')).toContain('production support must not depend');
});

test('live scenarios reject browser aliases, bypassed lifecycle and discovery tools', () => {
  const file = 'tests/customer-shipment/new.spec.ts';
  const fixture = "import { test as scenario } from '../fixtures';\n";
  for (const source of [
    "import { chromium as driver } from '@playwright/test';",
    "const driver = require('@playwright/test');",
    "import * as driver from '@playwright/test';",
    "import { request as api } from '@playwright/test';",
    "import { createEpicorClient as connect } from '../../src/api/baseClient';",
    "import '../../tools/discovery/driver';",
    "scenario('case', async ({page: browserPage}) => {});",
    "const path = 'discovery.local.json';",
  ]) expect(inspectArchitecture(file, fixture + source), source).not.toEqual([]);
});

test('API fixtures, narrow type contracts and harmless comments remain allowed', () => {
  expect(inspectArchitecture('src/api/example.ts', "import type { Dataset } from '../support/datasets';")).toEqual([]);
  expect(inspectArchitecture('src/flows/example.ts', "import { PartApi } from '../api/partApi';")).toEqual([]);
  expect(inspectArchitecture('tools/discovery/example.ts', "import { chromium } from '@playwright/test';")).toEqual([]);
  expect(inspectArchitecture('tests/customer-shipment/new.spec.ts', `
    import { test as scenario } from '../fixtures';
    import { expect } from '@playwright/test';
    // Do not call createEpicorClient or read discovery.local.json here.
    scenario('case', async ({epicor}) => {});
  `)).toEqual([]);
  expect(inspectArchitecture('tests/customer-shipment/nested/new.spec.ts', "import { test } from '../../fixtures';")).toEqual([]);
});
