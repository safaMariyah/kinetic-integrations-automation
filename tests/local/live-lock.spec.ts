import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLiveLock } from '../../src/support/liveLock';

test('live lock prevents overlapping target mutations and releases for the next run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kinetic-live-lock-'));
  try {
    const release = await acquireLiveLock(directory, 'target-one');
    await expect(acquireLiveLock(directory, 'target-one')).rejects.toThrow('Live execution is locked');
    const independent = await acquireLiveLock(directory, 'target-two');
    await independent();
    await release();
    const next = await acquireLiveLock(directory, 'target-one');
    await next();
  } finally { await rm(directory, {recursive: true}); }
});
