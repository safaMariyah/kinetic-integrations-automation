import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['html', {open: 'never'}], ['junit', {outputFile: 'test-results/results.xml'}]],
  projects: [
    {name: 'local', testMatch: '**/local/**/*.spec.ts'},
    {name: 'erp-orchestration', testMatch: '**/api/customer-shipment-orchestration.spec.ts'},
  ],
});
