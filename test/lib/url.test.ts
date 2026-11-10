import { describe, expect, it } from 'vitest';
import { domainOf, isHttpUrl, normalizeUrl } from '#src/lib/url.ts';

describe('normalizeUrl', () => {
  it('drops www, trailing slashes, fragments and tracking parameters', () => {
    expect(normalizeUrl('https://www.Example.com/post/?utm_source=hn&fbclid=x#top')).toBe('example.com/post');
  });

  it('keeps meaningful query parameters, sorted', () => {
    expect(normalizeUrl('https://example.com/a?b=2&a=1')).toBe('example.com/a?a=1&b=2');
  });

  it('treats http and https as the same article', () => {
    expect(normalizeUrl('http://example.com/a')).toBe(normalizeUrl('https://example.com/a'));
  });

  it('keeps the case of the path', () => {
    expect(normalizeUrl('https://example.com/Foo')).toBe('example.com/Foo');
  });

  it('lowercases strings that are not URLs', () => {
    expect(normalizeUrl(' Not A URL ')).toBe('not a url');
  });
});

describe('domainOf', () => {
  it('returns the host name without www', () => {
    expect(domainOf('https://www.zenn.dev/x')).toBe('zenn.dev');
  });
});

describe('isHttpUrl', () => {
  it('rejects schemes other than http(s)', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,x')).toBe(false);
    expect(isHttpUrl(42)).toBe(false);
  });
});

describe('edge cases', () => {
  it('keeps repeated query parameters in their original order', () => {
    expect(normalizeUrl('https://a.dev/s?tag=b&tag=a')).toBe('a.dev/s?tag=b&tag=a');
  });

  it('has no domain for something that is not a URL', () => {
    expect(domainOf('not a url')).toBe('');
  });
});
