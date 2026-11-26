import { loadEnvironment } from './src/config/environment';
import { randomUUID } from 'node:crypto';
// Workers reload this config. Reuse the coordinator's ID so attachments and manifests agree.
const inheritedRunDirectory = process.env.KINETIC_PLAYWRIGHT_RUN_DIRECTORY;
const runDirectory = process.env.TEST_WORKER_INDEX !== undefined && inheritedRunDirectory
  ? inheritedRunDirectory
  : `captures/runs/${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
process.env.KINETIC_PLAYWRIGHT_RUN_DIRECTORY = runDirectory;
loadEnvironment();
import { defineConfig } from '@playwright/test';
export default defineConfig({
  metadata: {runId: runDirectory.split('/').at(-1)},
  testDir: './tests', fullyParallel: false, workers: 1, retries: 0,
  outputDir: `${runDirectory}/test-results`,
  reporter: [['./src/support/runEvidence.ts', {directory: runDirectory}], ['list'], ['html', {open: 'never', outputFolder: `${runDirectory}/html`}], ['junit', {outputFile: `${runDirectory}/results.xml`}]],
  projects: [
    {name: 'local', testMatch: '**/local/**/*.spec.ts'},
    {name: 'erp-orchestration', testMatch: ['**/customer-shipment/**/*.spec.ts', '**/miscellaneous-shipment/**/*.spec.ts']},
  ],
});
