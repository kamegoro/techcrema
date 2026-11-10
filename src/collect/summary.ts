import type { Config } from '#src/config/config.ts';
import type { Feed, Section } from '#src/types.ts';

export const shownCount = (s: Section) => Math.min(s.limit, s.stories.length);
export const sectionLabel = (s: Section) => s.title ?? s.id;

const tableCell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ');

/** Markdown for the Actions run page: what each section got and what each source returned */
export function summarize(config: Config, feed: Feed, counts: Record<string, number>): string {
  const lines = [
    `## ☕ TechCrema — ${feed.date}`,
    '',
    `Language \`${config.language}\`, time zone \`${config.timezone}\``,
    '',
    '| Section | Shown | More |',
    '|---|---:|---:|',
    ...feed.sections.map((s) => `| ${sectionLabel(s)} | ${shownCount(s)} | ${s.stories.length - shownCount(s)} |`),
    '',
    '| Source | Items |',
    '|---|---:|',
    ...Object.entries(counts).map(([label, n]) => `| ${label} | ${n} |`),
    ...feed.errors.map((e) => `| ❌ ${e.source} | ${tableCell(e.message)} |`),
  ];
  const quiet = feed.sections.filter((s) => s.title !== undefined && s.stories.length === 0).map((s) => s.title);
  if (Object.keys(config.topics).length === 0) {
    lines.push('', '> No `topics` configured, so the page only shows what is popular. Add a few to personalize it.');
  } else if (quiet.length) {
    lines.push(
      '',
      `> Topics with no stories today: ${quiet.join(', ')}. That is normal on quiet days; if it keeps happening, try broader keywords or tags.`,
    );
  }
  return `${lines.join('\n')}\n`;
}
