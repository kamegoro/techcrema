/** Cuts text to `max` characters (not UTF-16 units, so an emoji is never split), ending with "…" when cut */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : text;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** A comment's HTML (as HN serves it) as plain text: paragraphs become line breaks, tags go, entities are decoded */
export function htmlToText(html: string): string {
  return html
    .replace(/<p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name: string) => {
      if (name.startsWith('#')) {
        const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
      }
      return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
