/**
 * ローカルサーバーを守るための純粋関数(テスト対象)。
 *
 * 想定している脅威:
 * - 他のWebサイトからの攻撃: CSRF、DNSリバインディング(悪意あるドメインを127.0.0.1に向けて同一オリジン扱いにさせる)
 * - 同じWi-Fiにいる他人(start:lan のとき)
 * - 壊れた・悪意ある入力によるプロトタイプ汚染や巨大データ
 */
import { timingSafeEqual } from 'node:crypto';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/**
 * Hostヘッダーが自分自身を指しているか。
 * DNSリバインディングでは Host が攻撃者のドメイン名になるので、ここで弾ける。
 */
export function isAllowedHostHeader(hostHeader: string | undefined, port: number, allowedHostnames: ReadonlySet<string>): boolean {
  if (!hostHeader) return false;
  let url: URL;
  try {
    url = new URL(`http://${hostHeader}`);
  } catch {
    return false;
  }
  const hostPort = url.port === '' ? 80 : Number(url.port);
  if (hostPort !== port) return false;
  const hostname = url.hostname.toLowerCase();
  return isLoopbackHost(hostname) || allowedHostnames.has(hostname);
}

/** POST の Origin が自分と同じか。Origin が無い(curl など)ときは許可する。 */
export function isSameOrigin(originHeader: string | undefined, hostHeader: string | undefined): boolean {
  if (!originHeader) return true;
  try {
    return new URL(originHeader).host === hostHeader;
  } catch {
    return false;
  }
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_KEY_LENGTH = 2048;

/** 記事キーとして受け付けてよい文字列か(オブジェクトのキーに使うのでプロトタイプ汚染を防ぐ) */
export function isValidStoryKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH && !FORBIDDEN_KEYS.has(key);
}

const MAX_MUTE_LENGTH = 200;
const MAX_MUTE_ITEMS = 200;

/** ミュート指定を「空でない短い文字列の配列」に整える */
export function sanitizeMuteList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => x !== '' && x.length <= MAX_MUTE_LENGTH)
    .slice(0, MAX_MUTE_ITEMS);
}

/** 長さに依存せず比較する(トークンの総当たりで1文字ずつ当てられないように) */
export function tokensEqual(a: string | undefined, b: string): boolean {
  if (typeof a !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name) {
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    }
  }
  return out;
}

/** http(s) 以外のURL(javascript: など)を弾く */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
