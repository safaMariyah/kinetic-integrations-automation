import { spawn } from 'node:child_process';
import { readEpicorSettings } from '../src/config/epicor';
import { acquireLiveLock } from '../src/support/liveLock';

/** Run supported live scenarios serially; ordinary test discovery remains separate. */
export async function run(): Promise<void> {
  const settings = readEpicorSettings();
  const args = process.argv.slice(3);
  if (args.some(arg => /^--(?:workers|retries|project|config|shard|repeat-each|fully-parallel)(?:=|$)/.test(arg) || /^-[cj](?:=|$)/.test(arg))) {
    console.error('Live runner fixes project, workers and retries. Use file filters and --grep to select scenarios; do not override execution policy.');
    process.exitCode = 1;
    return;
  }
  let release: () => Promise<void>;
  try { release = await acquireLiveLock(process.env.LIVE_LOCK_DIRECTORY?.trim() || '.runtime/locks', `${settings.baseUrl}|${settings.company}`); }
  catch (error) {
    console.error(error instanceof Error ? error.message : 'Live lock could not be acquired.');
    process.exitCode = 1;
    return;
  }
  try {
    console.log('Live scope lock acquired. Tests run serially with zero retries; retained business effects are not rolled back.');
    const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...args,
      '--project=erp-orchestration', '--workers=1', '--retries=0'], {stdio: 'inherit', env: process.env});
    // Do not release on parent termination: an interrupted child may still be running.
    const code = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
    });
    process.exitCode = code;
  } finally { await release(); }
}
