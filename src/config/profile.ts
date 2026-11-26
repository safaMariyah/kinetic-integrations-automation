import { readFileSync } from 'node:fs';

export interface TargetProfile {
  name: string; erpBaseUrl: string; company: string; plant: string;
  sourceWarehouse: string; allocationProfile: 'epic06-mfgsys-chi';
}

/** Profiles contain target/capability declarations only; reject unknown/private fields. */
export function readTargetProfile(): TargetProfile | undefined {
  const file = process.env.TEST_TARGET_PROFILE?.trim();
  if (!file) return undefined;
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new Error('TEST_TARGET_PROFILE could not be read as JSON. Check the selected profile file.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Target profile must be an object.');
  const profile = value as Record<string, unknown>;
  const fields = ['name', 'erpBaseUrl', 'company', 'plant', 'sourceWarehouse', 'allocationProfile'];
  if (Object.keys(profile).some(key => !fields.includes(key)) || fields.some(key => typeof profile[key] !== 'string' || !(profile[key] as string).trim())) {
    throw new Error('Target profile requires exactly name, erpBaseUrl, company, plant, sourceWarehouse and allocationProfile. Keep secrets and machine paths in private environment settings.');
  }
  let url: URL;
  try { url = new URL(profile.erpBaseUrl as string); } catch { throw new Error('Target profile ERP URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Target profile ERP URL must be HTTPS without credentials, query or fragment.');
  if (profile.allocationProfile !== 'epic06-mfgsys-chi' || profile.company !== 'EPIC06' || profile.plant !== 'MfgSys' || profile.sourceWarehouse !== 'CHI') {
    throw new Error('Unsupported allocation profile. Only the evidenced EPIC06/MfgSys/CHI capability is implemented; another target requires contract and master-data validation.');
  }
  return profile as unknown as TargetProfile;
}

export function applyTargetProfile(): void {
  const profile = readTargetProfile();
  if (!profile) return;
  const defaults = {EPICOR_BASE_URL: profile.erpBaseUrl, EPICOR_COMPANY: profile.company, POC_PLANT: profile.plant, POC_FROM_WHSE: profile.sourceWarehouse};
  for (const [key, value] of Object.entries(defaults)) if (process.env[key] === undefined) process.env[key] = value;
  validateTargetProfile();
}

export function validateTargetProfile(): void {
  const profile = readTargetProfile();
  if (!profile) return;
  if (process.env.EPICOR_BASE_URL?.replace(/\/+$/, '') !== profile.erpBaseUrl.replace(/\/+$/, '') ||
      process.env.EPICOR_COMPANY !== profile.company || process.env.POC_PLANT !== profile.plant || process.env.POC_FROM_WHSE !== profile.sourceWarehouse) {
    throw new Error('Effective ERP target/company/site/source warehouse conflicts with TEST_TARGET_PROFILE. Select the matching profile; no ERP request was started.');
  }
}
