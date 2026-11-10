import { describe, expect, it } from 'vitest';
import { PLATFORM_IDS } from '#src/config/config.ts';
import { PLATFORMS } from '#src/sources/index.ts';

describe('PLATFORMS', () => {
  it('has a front page for every source the settings accept', () => {
    expect(Object.keys(PLATFORMS).sort()).toEqual([...PLATFORM_IDS].sort());
    for (const platform of Object.values(PLATFORMS)) expect(platform.frontPage).toBeTypeOf('function');
  });
});
