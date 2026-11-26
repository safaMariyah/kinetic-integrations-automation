import { test, expect, type APIRequestContext } from '@playwright/test';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renewQuickShipSession } from '../../src/integrations/quickship/session';
import { requireQuickShipTarget } from '../../src/config/quickship';

for (const mode of ['success', 'refresh-rejected', 'scope-rejected', 'final-reader-rejected'] as const) {
  test(`session renewal: ${mode}; no retry and private saved-state protection`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quickship-session-'));
    const file = join(directory, 'session.json');
    const settings = {baseURL:'https://example.test', registrationCode:'fixture-registration', companyId:'company-id', storageState:file};
    let attempts = 0, contextDisposed = 0, readersDisposed = 0;
    const readerPaths: string[] = [];
    try {
      await writeFile(file, 'original-private-state');
      const context = {
        post:async (_path: string, options: {maxRetries:number; maxRedirects:number}) => {
          attempts++; expect(options.maxRetries).toBe(0); expect(options.maxRedirects).toBe(0);
          return {status:()=>mode === 'refresh-rejected' ? 401 : 200};
        },
        storageState:async (options: {path:string}) => {await writeFile(options.path, 'rotated-private-state');},
        dispose:async () => {contextDisposed++;},
      } as unknown as APIRequestContext;
      const action = renewQuickShipSession(settings, 'EPIC06', () => {}, {
        context:async options => {expect(options?.storageState).toBe(file); return context;},
        reader:async (_base, _registration, path) => {
          readerPaths.push(path);
          return {verifyScope:async () => {
            expect(await readFile(path, 'utf8')).toBe('rotated-private-state');
            if (mode === 'scope-rejected' || (mode === 'final-reader-rejected' && readerPaths.length === 2)) throw new Error('fixture scope mismatch');
          }, dispose:async () => {readersDisposed++;}, readCreated:async () => {throw new Error('Shipment reads must not run');}, read:async () => {throw new Error('Shipment reads must not run');}};
        },
      });
      if (mode === 'success') await action; else await expect(action).rejects.toThrow();
      expect(attempts).toBe(1);
      expect(contextDisposed).toBe(1);
      expect(readersDisposed).toBe(readerPaths.length);
      expect(await readFile(file, 'utf8')).toBe((mode === 'success' || mode === 'final-reader-rejected') ? 'rotated-private-state' : 'original-private-state');
      expect(await readdir(directory)).toEqual(['session.json']);
      if (mode === 'success') {expect(readerPaths).toHaveLength(2); expect(readerPaths[1]).toBe(file);}
    } finally {await rm(directory, {recursive:true});}
  });
}

test('authentication target must match before any network dependency is created', () => {
  const settings = {baseURL:'https://example.test', registrationCode:'fixture', companyId:'company-id', storageState:'unused'};
  expect(() => requireQuickShipTarget([], settings, 'EPIC06')).toThrow('before network access');
  expect(() => requireQuickShipTarget(['--target=https://example.test|OTHER|company-id'], settings, 'EPIC06')).toThrow();
  expect(() => requireQuickShipTarget(['--target=https://example.test|EPIC06|company-id'], settings, 'EPIC06')).not.toThrow();
});
