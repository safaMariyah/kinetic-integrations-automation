import { validateTargetProfile } from './profile';
export interface EpicorSettings {
  baseUrl: string;
  company: string;
  timeoutMs: number;
}

export function readEpicorSettings(): EpicorSettings {
  validateTargetProfile();
  const baseUrl = process.env.EPICOR_BASE_URL?.trim();
  const company = process.env.EPICOR_COMPANY?.trim();
  const timeoutMs = Number(
    process.env.API_REQUEST_TIMEOUT_MS ?? '15000',
  );

  if (!baseUrl || !company) {
    throw new Error(
      'Set EPICOR_BASE_URL and EPICOR_COMPANY before using Epicor APIs.',
    );
  }

  const parsedUrl = new URL(baseUrl);

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      'EPICOR_BASE_URL must be an HTTPS URL without credentials, query, or fragment.',
    );
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('API_REQUEST_TIMEOUT_MS must be a positive number.');
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    company,
    timeoutMs,
  };
}
