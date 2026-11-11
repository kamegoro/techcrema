import { describe, expect, it } from 'vitest';
import { detectLang, htmlToText, tagSlug, truncate } from '#src/lib/text.ts';

describe('truncate', () => {
  it('cuts by character, never inside an emoji, and marks the cut', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('🦀🦀🦀🦀', 3)).toBe('🦀🦀…');
    expect(truncate('short', 10)).toBe('short');
  });
});

describe('htmlToText', () => {
  it('turns paragraphs into line breaks and drops tags', () => {
    expect(htmlToText('First point.<p>Second, with <a href="https://x.dev">a link</a> and <i>emphasis</i>.')).toBe(
      'First point.\nSecond, with a link and emphasis.',
    );
  });

  it('drops a tag left open at the end', () => {
    expect(htmlToText('Read this<a href="https://x.dev')).toBe('Read this');
  });

  it('decodes named and numeric character references', () => {
    expect(htmlToText('It&#x27;s &quot;fine&quot; &amp; 5 &gt; 3 &#169;')).toBe('It\'s "fine" & 5 > 3 ©');
  });

  it('leaves references it does not know as they are', () => {
    expect(htmlToText('&unknown; &#0; &#x110000;')).toBe('&unknown; &#0; &#x110000;');
  });
});

describe('detectLang', () => {
  it('kana means Japanese', () => {
    expect(detectLang('Neovim 0.12 の新機能')).toBe('ja');
  });
  it('ideographs without kana mean Chinese', () => {
    expect(detectLang('让你的命令行 Agent 在后台自己接活')).toBe('zh');
  });
  it('anything else is English', () => {
    expect(detectLang('Node.js 27 released')).toBe('en');
  });
});

describe('tagSlug', () => {
  it('keeps lowercase letters and digits only', () => {
    expect(tagSlug('Node.js')).toBe('nodejs');
    expect(tagSlug('テスト')).toBe('');
  });
});
