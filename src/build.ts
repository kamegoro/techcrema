/**
 * 公開用の静的サイトを dist/ に組み立てる: web/ の中身 + data/feed.json
 * サーバーは不要で、GitHub Pages などにそのまま置ける。
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, loadFeed, ROOT } from './store.ts';

export const DIST_DIR = path.join(ROOT, 'dist');

export async function build(): Promise<void> {
  const feed = await loadFeed();
  if (!feed) throw new Error('data/feed.json がありません。先に npm run collect を実行してください');
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });
  await cp(path.join(ROOT, 'web'), DIST_DIR, { recursive: true });
  // 公開するのは今日のページだけ。スコア履歴や表示済みリストは出さない
  await cp(path.join(DATA_DIR, 'feed.json'), path.join(DIST_DIR, 'feed.json'));
}

if (import.meta.main) {
  await build();
  console.log(`dist/ に書き出しました(npm run preview で確認できます)`);
}
