/** Cuts by character (an emoji is never split) and marks the cut with "…" */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const ENTITY = /&(#x[\da-f]+|#\d+|\w+);/gi;

function decodeEntity(entity: string, name: string): string {
  if (!name.startsWith('#')) return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
}

/** "&#8211;" → "–", "&amp;" → "&"; unknown references stay as they are */
export const decodeEntities = (text: string) => text.replace(ENTITY, decodeEntity);

/** Walks the HTML one character at a time, so no tag survives, not even one left open at the end */
function stripTags(html: string): string {
  let text = '';
  let tag: string | null = null;
  for (const ch of html) {
    if (tag === null) {
      if (ch === '<') tag = '';
      else text += ch;
    } else if (ch === '>') {
      if (tag.toLowerCase() === 'p') text += '\n';
      tag = null;
    } else {
      tag += ch;
    }
  }
  return text;
}

/** HTML as HN serves comments, as plain text: paragraphs become line breaks */
export function htmlToText(html: string): string {
  return stripTags(html)

    .replace(ENTITY, decodeEntity)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export type Lang = 'ja' | 'en' | 'zh';

/** Kana means Japanese. Ideographs alone can't tell Japanese from Chinese, so without kana they mean Chinese. */
export function detectLang(text: string): Lang {
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\u3400-\u9fff]/.test(text)) return 'zh';
  return 'en';
}

/** How Zenn and dev.to spell a tag: "Node.js" → "nodejs" */
export const tagSlug = (tag: string) => tag.toLowerCase().replace(/[^a-z0-9]/g, '');
