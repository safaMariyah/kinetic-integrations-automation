import type { APIResponse } from '@playwright/test';
import type { Row } from '../support/datasets';

/** Playwright transport errors contain headers and bodies. Never retain them as causes. */
export class EpicorTransportError extends Error {
  constructor(method: 'GET' | 'POST', failure: unknown) {
    const text = failure instanceof Error ? failure.message : '';
    const reason = /certificate|CERT_|self.signed|unable to verify/i.test(text)
      ? 'Certificate trust was rejected. Configure NODE_EXTRA_CA_CERTS with the approved CA before starting Node.'
      : /timeout|timed out/i.test(text)
        ? 'The request timed out.'
        : /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN/i.test(text)
          ? 'The service could not be reached or the connection was interrupted.'
          : 'The request could not complete.';
    super(`ERP ${method} transport failed. ${reason} ${method === 'POST'
      ? 'The write outcome is uncertain; inspect persisted state before retrying.'
      : 'No write was requested by this read; verify connectivity before continuing.'} Request headers, body and raw error are withheld.`);
    this.name = 'EpicorTransportError';
  }
}

// Deliberately lossy: retain business-error vocabulary, never arbitrary server values.
// Unknown words (including customer names), quoted values and URLs are withheld.
export function epicorErrorSummary(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'business error body unavailable';
  const body = value as Row;
  const allowed = new Set(('a an the is are was were be been must cannot can not valid invalid required missing duplicate already exists record row has have changed modified deleted updated added update add delete save failed failure error errors exception business validation part customer revision price quantity order line release number selected selection inactive active available specified found for in on of to and or with before after by this that does do match matches mismatch unique constraint violation null empty allowed field table value data dataset key database unable please select enter approved unapproved effective date unit selling sales stock insufficient locked concurrency').split(' '));
  const message = (v: unknown) => typeof v === 'string' ? v.slice(0, 2000)
    .replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|["'][^"'\r\n]*["']/g, '[withheld]')
    .replace(/[A-Za-z0-9_./:@~+-]+/g, word => allowed.has(word.toLowerCase()) ? word : '[withheld]')
    .replace(/(?:\[withheld\]\s*){2,}/g, '[withheld] ').slice(0, 400) : '';
  const details = Array.isArray(body.ErrorDetails) ? body.ErrorDetails.slice(0, 8) : [];
  const messages = [body.ErrorMessage, body.message, ...details.map(d => d && typeof d === 'object' ? (d as Row).Message : undefined)]
    .map(message).filter(Boolean);
  const numbers = details.flatMap(d => d && typeof d === 'object' && typeof (d as Row).ErrorNum === 'number' && Number.isSafeInteger((d as Row).ErrorNum) ? [(d as Row).ErrorNum] : []);
  // Exact observed server method is safe diagnostic vocabulary, not arbitrary server text.
  const reloadFailure = details.some(d => d && typeof d === 'object' &&
    (d as Row).Program === 'Erp.Services.BO.CustShip.dll' && (d as Row).Method === 'ReloadUpdatedShipHead');
  return [numbers.length ? `ErrorNum=${numbers.join(',')}` : '', ...messages,
    reloadFailure ? 'CustShip.ReloadUpdatedShipHead failed: reconcile the retained SysRowID through an authoritative read; the pack key may have changed. Do not assume deletion or replay the save.' : '']
    .filter(Boolean).join('; ') || 'business error details unavailable';
}
function nextAction(status: number): string {
  if (status === 401) return 'Authentication was rejected. Renew the configured session or credentials before starting another run.';
  if (status === 403) return 'Access was denied. Verify account permissions and company scope.';
  if (status === 404) return 'The requested service or record was not found. Check the operation and retained record identity.';
  if (status === 409) return 'The server reported a conflict. Read current persisted state before deciding whether another write is safe.';
  if (status === 429) return 'The service is limiting requests. Stop this execution and inspect persisted state before a later run.';
  return 'Inspect persisted state before retrying; a failed response does not prove the write was rolled back.';
}

export async function json(result: Promise<{response: APIResponse; elapsedMs: number}>, operation: string, status = 200): Promise<Row> {
  let response: APIResponse;
  try { ({response} = await result); }
  catch (error) { throw new Error(`${operation}: ${error instanceof EpicorTransportError ? error.message : 'transport failure; inspect persisted state before retrying.'}`); }
  if (response.status() !== status) {
    let detail = 'non-JSON business error body withheld';
    if (/application\/json/i.test(response.headers()['content-type'] ?? '')) {
      try { detail = epicorErrorSummary(await response.json()); } catch { detail = 'business error body unreadable'; }
    }
    throw new Error(`${operation}: HTTP ${response.status()}; ${detail}; ${nextAction(response.status())}`);
  }
  if (!/application\/json/i.test(response.headers()['content-type'] ?? '')) throw new Error(`${operation}: expected JSON.`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`${operation}: expected a JSON object response.`);
  return body as Row;
}
