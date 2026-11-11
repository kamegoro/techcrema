// One story: its title (and translation), what people said, where it is popular, and its buttons.
import { h, icon, safeUrl } from './dom.js';
import { formatCount, language, t, timeAgo } from './i18n.js';
import { translationOf } from './translate.js';

const SITE_NAMES = {
  hackernews: 'HN',
  hatena: 'Hatena',
  zenn: 'Zenn',
  qiita: 'Qiita',
  devto: 'dev.to',
  huggingface: 'HF Papers',
  github_new_repos: 'GitHub',
  official: 'Official',
  github_release: 'Release',
};
/** Sites whose name is translated; the others are proper names */
const TRANSLATED_SITE_NAMES = new Set(['hatena']);

const VOICES_LINK_KEYS = new Set(['hackernews', 'hatena']);

const siteName = (site) => (TRANSLATED_SITE_NAMES.has(site) ? t(`source.${site}`) : (SITE_NAMES[site] ?? site));

/**
 * `on` connects the buttons and links to the app:
 * isRead(key), isSaved(key), open(story, fromLater), read(story), toggleLater(story), mute(story)
 */
export function createStoryView(on) {
  /** Where each story is drawn, so one can be redrawn without moving anything else */
  const drawn = new Map();
  /** Comments opened to their full length, as `${story key}#${index}` */
  const openComments = new Set();

  function redraw(key) {
    const entries = drawn.get(key) ?? [];
    drawn.set(key, []);
    for (const { li, story, idPrefix, options } of entries) {
      const focusable = (el) => [...el.querySelectorAll('a, button')];
      const focused = focusable(li).indexOf(document.activeElement);
      const next = item(story, idPrefix, options);
      li.replaceWith(next);
      if (focused >= 0) focusable(next)[focused]?.focus();
    }
  }

  const translated = (text, lang, story) => translationOf({ lang, text }, language(), () => redraw(story.key));

  function title(story, titleId, options) {
    const href = safeUrl(story.url);
    const translation = translated(story.title, story.lang, story);
    const text = [
      h('span', { lang: story.lang }, story.title),
      translation ? h('span', { class: 'story-translation', lang: language() }, translation) : null,
    ];
    const link = href
      ? h(
          'a',
          {
            class: 'story-link',
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
            onclick: () => on.open(story, options.fromLater),
          },
          text,
        )
      : text;
    return h('h3', { class: 'story-title', id: titleId }, link);
  }

  /** Who wrote the comment, linking to the whole of it, since only a part is shown here */
  function byline(c) {
    const href = typeof c.author === 'string' && c.url ? safeUrl(c.url) : null;
    if (!href) return null;
    return h(
      'a',
      {
        class: 'voice-by',
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        translate: 'no',
        'aria-label': t('voice.whole', { author: c.author }),
      },
      `\u2014 ${c.author}`,
    );
  }

  function comment(story, c, index) {
    const id = `${story.key}#${index}`;
    const open = openComments.has(id);
    const translation = translated(c.text, c.lang, story);
    const bubble = h(
      'button',
      {
        class: `voice${open ? ' is-open' : ''}`,
        type: 'button',
        'aria-expanded': String(open),
        onclick: () => {
          if (open) openComments.delete(id);
          else openComments.add(id);
          redraw(story.key);
        },
      },
      translation
        ? [
            h('span', { class: 'voice-text', lang: language() }, translation),
            open ? h('span', { class: 'voice-original', lang: c.lang }, c.text) : null,
          ]
        : h('span', { class: 'voice-text', lang: c.lang }, c.text),
    );
    return h('div', { class: 'voice-item' }, bubble, byline(c));
  }

  function voices(story) {
    const v = story.voices;
    const href = v ? safeUrl(v.url) : null;
    if (!href || !Array.isArray(v.comments) || v.comments.length === 0) return null;
    return h(
      'div',
      { class: 'voices' },
      v.comments.map((c, i) => comment(story, c, i)),
      h(
        'a',
        {
          class: 'voices-more',
          href,
          target: '_blank',
          rel: 'noopener noreferrer',
          translate: 'no',
          onclick: () => on.read(story),
        },
        // Each site counts in its own unit: HN its comments, Hatena the people who bookmarked (most leave no comment)
        t(VOICES_LINK_KEYS.has(v.source) ? `voices.more.${v.source}` : 'voices.more', {
          source: siteName(v.source),
          n: formatCount(v.count),
        }),
      ),
    );
  }

  /** Where the story is popular ("HN 668"), linking to its discussion when there is one */
  function source(appearance, story) {
    // A deck's number is its Hatena bookmarks, so it shows as Hatena; a tag says it is slides
    const site = appearance.source === 'slides' ? 'hatena' : appearance.source;
    const name = siteName(site);
    const { score, scoreLabel } = appearance;
    const hasScore = score !== null && score !== undefined;
    const content = [h('span', { class: 'source-dot' }), name];
    if (hasScore) {
      // The unit (pt, likes…) is in the accessible name only; on screen the number is enough
      content.push(' ', h('span', { class: 'source-score' }, `${scoreLabel === '★' ? '★' : ''}${formatCount(score)}`));
    }
    const href = appearance.discussionUrl ? safeUrl(appearance.discussionUrl) : null;
    if (!href) {
      const title = hasScore ? `${score} ${scoreLabel ?? ''}`.trim() : undefined;
      return h('span', { class: 'source', title, translate: 'no', dataset: { source: site } }, ...content);
    }
    return h(
      'a',
      {
        class: 'source',
        translate: 'no',
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        dataset: { source: site },
        onclick: () => on.read(story),
        'aria-label': t('discussion', { source: name, score: `${score ?? ''} ${scoreLabel ?? ''}`.trim() }),
      },
      ...content,
      icon('comment'),
    );
  }

  function meta(story) {
    const official = story.appearances.every((a) => a.source === 'official');
    const isSlides = story.appearances.some((a) => a.source === 'slides');
    const onHatena = story.appearances.some((a) => a.source === 'hatena');
    return h(
      'div',
      { class: 'story-meta' },
      // Read stories are dimmed; screen readers get it in words
      on.isRead(story.key) ? h('span', { class: 'visually-hidden' }, t('read')) : null,
      official
        ? h(
            'span',
            { class: 'source', dataset: { source: 'official' } },
            h('span', { class: 'source-dot' }),
            story.publisher ?? t('source.official'),
          )
        : story.appearances.filter((a) => !(a.source === 'slides' && onHatena)).map((a) => source(a, story)),
      ['major', 'minor', 'patch'].includes(story.releaseKind)
        ? h(
            'span',
            { class: `tag${story.releaseKind === 'major' ? ' tag-accent' : ''}` },
            t(`release.${story.releaseKind}`),
          )
        : null,
      isSlides ? h('span', { class: 'tag' }, t('slides')) : null,
      story.resurfaced ? h('span', { class: 'tag tag-accent' }, t('resurfaced')) : null,
      story.groupedCount ? h('span', {}, t('grouped', { n: story.groupedCount })) : null,
      official ? null : h('span', { class: 'story-domain', translate: 'no' }, story.domain),
      story.publishedAt ? h('time', { datetime: story.publishedAt }, timeAgo(story.publishedAt)) : null,
    );
  }

  function actions(story) {
    const saved = on.isSaved(story.key);
    return h(
      'div',
      { class: 'story-actions' },
      h(
        'button',
        {
          class: 'action action-later',
          type: 'button',
          'aria-pressed': String(saved),
          'aria-label': t(saved ? 'unlater' : 'later'),
          title: t('later'),
          onclick: () => on.toggleLater(story),
        },
        icon('later'),
      ),
      h(
        'button',
        { class: 'action', type: 'button', 'aria-label': t('mute'), title: t('mute'), onclick: () => on.mute(story) },
        icon('mute'),
      ),
    );
  }

  /** The story as an <article> named by its title; `idPrefix` keeps ids unique on the page */
  function item(story, idPrefix, options = {}) {
    const titleId = `${idPrefix}-title`;
    const li = h(
      'li',
      {},
      h(
        'article',
        { class: `story${on.isRead(story.key) ? ' is-read' : ''}`, 'aria-labelledby': titleId },
        title(story, titleId, options),
        voices(story),
        h('div', { class: 'story-footer' }, meta(story), actions(story)),
      ),
    );
    drawn.set(story.key, [...(drawn.get(story.key) ?? []), { li, story, idPrefix, options }]);
    return li;
  }

  return { item, redraw, forget: () => drawn.clear() };
}
