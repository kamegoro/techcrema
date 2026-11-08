/** 外部から来た値の検証 */

/** http(s) 以外のURL(javascript: や data: など)を弾く */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
