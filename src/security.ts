/** Validation for values that come from outside */

/** Rejects anything that isn't an http(s) URL (javascript:, data:, ...) */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
