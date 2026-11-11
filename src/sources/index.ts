import type { PlatformId } from '#src/config/config.ts';
import type { Platform } from '#src/types.ts';
import { devto } from './devto.ts';
import { github } from './github.ts';
import { hackernews } from './hackernews.ts';
import { hatena, slides } from './hatena.ts';
import { huggingface } from './huggingface.ts';
import { qiita } from './qiita.ts';
import { zenn } from './zenn.ts';

export const PLATFORMS: Record<PlatformId, Platform> = {
  hackernews,
  devto,
  huggingface,
  github,
  hatena,
  slides,
  zenn,
  qiita,
};
