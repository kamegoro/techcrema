import { describe, expect, it } from 'vitest';
import { htmlToText, truncate } from '#src/text.ts';

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

  it('decodes named and numeric character references', () => {
    expect(htmlToText('It&#x27;s &quot;fine&quot; &amp; 5 &gt; 3 &#169;')).toBe('It\'s "fine" & 5 > 3 ©');
  });

  it('leaves references it does not know as they are', () => {
    expect(htmlToText('&unknown; &#0; &#x110000;')).toBe('&unknown; &#0; &#x110000;');
  });
});
