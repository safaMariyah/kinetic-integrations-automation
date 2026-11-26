import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/** Exclusive across processes sharing this directory. Never infer a stale lock is safe to remove. */
export async function acquireLiveLock(directory: string, target: string): Promise<() => Promise<void>> {
  await mkdir(directory, {recursive: true});
  const file = join(directory, createHash('sha256').update(target).digest('hex') + '.lock');
  let handle;
  try { handle = await open(file, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Live execution is locked. Inspect ${file} and the associated ERP state before another run. Do not delete a lock belonging to an active process.`);
    }
    throw error;
  }
  try { await handle.writeFile(JSON.stringify({pid: process.pid, startedAt: new Date().toISOString(), runId: randomUUID()})); }
  catch (error) { await handle.close(); await unlink(file); throw error; }
  await handle.close();
  return async () => { await unlink(file); };
}
