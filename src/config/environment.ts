import { applyTargetProfile } from './profile';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Existing process variables win, allowing CI secret injection without file edits. */
export function loadEnvironment(): void {
  const selected = process.env.TEST_ENV_FILE?.trim();
  const file = selected || '.env';
  if (!existsSync(file)) {
    if (selected) throw new Error('TEST_ENV_FILE selects a missing file. Correct the environment selection before execution.');
    applyTargetProfile();
    return; // CI/offline execution may use process variables only.
  }
  try { process.loadEnvFile(resolve(file)); }
  catch { throw new Error('Environment file could not be loaded. Check its access and format; values are withheld.'); }
  applyTargetProfile();
}
