/** Read environment values at execution time so test discovery never needs credentials. */
export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Set it in the selected environment before running this scenario.`);
  return value;
}

export function scenarioNumber(name: string, fallback: number, allowZero = false): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${name} must be a finite ${allowZero ? 'nonnegative' : 'positive'} number. Correct the scenario configuration before execution.`);
  }
  return value;
}
