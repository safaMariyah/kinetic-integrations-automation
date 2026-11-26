import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { required } from './values';

/** Provenance approval is bound to the configured artifact directory, never inferred. */
export async function readArtifactDirectory(): Promise<string> {
  const directory = required('QUICKSHIP_REQUEST_DIRECTORY');
  const configFile = process.env.RUNTIME_CONFIG_FILE?.trim() || '.runtime/config.json';
  let config: unknown;
  try { config = JSON.parse(await readFile(configFile, 'utf8')); }
  catch { throw new Error('Artifact preflight could not read runtime configuration. Set RUNTIME_CONFIG_FILE or configure .runtime/config.json with confirmed artifact provenance. No business operation was started.'); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Runtime configuration must be a JSON object.');
  const artifact = config as Record<string, unknown>;
  if (artifact.artifactProvenance !== 'user-confirmed' || typeof artifact.artifactDirectory !== 'string' || resolve(artifact.artifactDirectory) !== resolve(directory)) {
    throw new Error('Artifact preflight failed: confirmed artifactDirectory must match QUICKSHIP_REQUEST_DIRECTORY. Confirm the actual outgoing QuickShip location before running this scenario.');
  }
  try { await access(directory); }
  catch { throw new Error('Confirmed QuickShip artifact directory is inaccessible from this machine. Mount the directory or correct the runtime profile before executing shipment mutations.'); }
  return directory;
}
