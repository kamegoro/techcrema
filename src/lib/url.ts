/** Only http(s) links are kept; javascript:, data: and the like are dropped */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'ref', 'ref_src', 'source', 'mc_cid', 'mc_eid', 'igshid', 'si']);
const isTrackingParam = (name: string) => name.startsWith('utm_') || TRACKING_PARAMS.has(name);

/**
 * The same article gets the same key wherever it is linked from.
 * e.g. "https://www.Example.com/post/?utm_source=hn#top" → "example.com/post"
 */
export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return input.trim().toLowerCase();
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name.toLowerCase()))
    .sort(([a], [b]) => Number(a > b) - Number(a < b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  // The path keeps its case: some sites treat paths case-sensitively
  return `${host}${url.pathname.replace(/\/+$/, '')}${query}`;
}

export function domainOf(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
