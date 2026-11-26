import { resolve } from 'node:path';
import { required } from './values';

export interface QuickShipSettings {
  baseURL: string;
  registrationCode: string;
  companyId: string;
  storageState: string;
}

/** Resolve the exact reader-consumed state path; never log authentication values. */
export function readQuickShipSettings(): QuickShipSettings {
  const baseURL = required('QUICKSHIP_BASE_URL');
  if (new URL(baseURL).origin !== baseURL) throw new Error('QUICKSHIP_BASE_URL must be an origin without a path, credentials, query or fragment.');
  return {
    baseURL,
    registrationCode: required('QUICKSHIP_REGISTRATION_CODE'),
    companyId: required('QUICKSHIP_COMPANY_ID'),
    storageState: resolve(required('QUICKSHIP_STORAGE_STATE')),
  };
}

export function requireQuickShipTarget(args: string[], settings: QuickShipSettings, company: string): void {
  const target = args.find(value => value.startsWith('--target='))?.slice('--target='.length);
  if (target !== `${settings.baseURL}|${company}|${settings.companyId}`) {
    throw new Error('QuickShip command stopped before network access. Supply --target=<QUICKSHIP_BASE_URL>|<EPICOR_COMPANY>|<QUICKSHIP_COMPANY_ID> matching the selected configuration.');
  }
}
