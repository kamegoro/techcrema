import { fetchJson } from '#src/lib/http.ts';
import type { Platform, RawItem } from '#src/types.ts';

interface DailyPaper {
  title: string;
  publishedAt: string;
  paper: { id: string; upvotes: number };
}

async function frontPage(): Promise<RawItem[]> {
  const papers = await fetchJson<DailyPaper[]>('https://huggingface.co/api/daily_papers?limit=50');
  return papers.map((p) => ({
    source: 'huggingface',
    title: p.title,
    url: `https://huggingface.co/papers/${p.paper.id}`,
    score: p.paper.upvotes,
    scoreLabel: 'upvotes',
    tags: ['paper', 'ai'],
    publishedAt: p.publishedAt,
  }));
}

export const huggingface: Platform = { frontPage };
