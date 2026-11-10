// TechCrema in the browser. Text from outside (titles etc.) only ever goes in via textContent, never innerHTML.
import { formatDate, formatTime, language, setLanguage, t, timeAgo, translateDocument } from './i18n.js';
import { translationOf } from './translate.js';

const SOURCE_LABELS = {
  hackernews: 'HN',
  hatena: 'Hatena',
  slides: 'Slides',
  zenn: 'Zenn',
  qiita: 'Qiita',
  devto: 'dev.to',
  lobsters: 'Lobsters',
  huggingface: 'HF Papers',
  github_new_repos: 'GitHub',
  official: 'Official',
  github_release: 'Release',
};
/** Sources whose name differs by language (the rest are proper names) */
const LOCALIZED_SOURCES = new Set(['hatena', 'slides']);
const STATE_KEY = 'techcrema-state-v1';
// Caps (oldest dropped first) so localStorage doesn't fill up
const MAX_READ = 3000;
const MAX_LATER = 300;

const ICONS = {
  later: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  mute: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  comment: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
};

const data = { feed: null, state: loadState() };
let loadError = null;
/** Sections opened with "Show more" (until the page is reloaded) */
const expanded = new Set();
/** Where each story is drawn, so one story can be redrawn without moving anything else */
const views = new Map();
/** Comments opened to their full length, as `${story key}#${index}` (kept when a story is redrawn) */
const openVoices = new Set();
/** A newer feed.json, held back until the reader asks for it so nothing changes under their thumb */
let pendingFeed = null;

const $ = (id) => document.getElementById(id);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  // ICONS are our own constants, so innerHTML is safe here
  svg.innerHTML = ICONS[name];
  return svg;
}

/** Only http(s) URLs become links (never javascript: etc.) */
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function formatScore(n) {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function emptyUserState() {
  return { read: [], later: [], mute: { keywords: [], domains: [] } };
}

function strings(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 2048) : [];
}

/** Checks every type while reading, so corrupted or outdated data can't break the page */
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return emptyUserState();
    return {
      read: strings(raw.read),
      later: Array.isArray(raw.later)
        ? raw.later
            .filter(
              (x) => x && typeof x.key === 'string' && typeof x.title === 'string' && Array.isArray(x.appearances),
            )
            .map((x) => ({ ...x, tags: strings(x.tags), matchedKeywords: strings(x.matchedKeywords) }))
        : [],
      mute: { keywords: strings(raw.mute?.keywords), domains: strings(raw.mute?.domains) },
    };
  } catch {
    return emptyUserState();
  }
}

function saveState() {
  const s = data.state;
  s.read = s.read.slice(-MAX_READ);
  s.later = s.later.slice(0, MAX_LATER);
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    toast(t('save.failed'));
  }
}

function keywordMatcher(keyword) {
  const k = keyword.trim().toLowerCase();
  if (!k) return () => false;
  if (/^\p{ASCII}+$/u.test(k)) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
    return (text) => re.test(text);
  }
  return (text) => text.toLowerCase().includes(k);
}

/** Builds the keyword matchers once for a whole render instead of once per story */
function muteFilter(mute) {
  const domains = mute.domains.map((d) => d.toLowerCase());
  const keywords = mute.keywords.map(keywordMatcher);
  return (story) => {
    const domain = (story.domain ?? '').toLowerCase();
    if (domains.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
    const text = `${story.title} ${(story.tags ?? []).join(' ')}`;
    return keywords.some((matches) => matches(text));
  };
}

/**
 * Drops muted stories and moves read ones after the unread (so a second visit in a day shows what is left),
 * then keeps the first `limit` of each section unless it was expanded; `more` counts the rest
 */
function visibleSections(feed) {
  const isMuted = muteFilter(data.state.mute);
  const read = new Set(data.state.read);
  return feed.sections.map((s) => {
    const kept = s.stories.filter((st) => !isMuted(st));
    const stories = [...kept.filter((st) => !read.has(st.key)), ...kept.filter((st) => read.has(st.key))];
    const shown = expanded.has(s.id) ? stories : stories.slice(0, s.limit ?? stories.length);
    return { ...s, stories: shown, more: stories.length - shown.length };
  });
}

const sectionTitle = (section) => section.title ?? t(`section.${section.id}`);

function showFeed(feed) {
  data.feed = feed;
  pendingFeed = null;
  if (setLanguage(feed.language)) translateDocument();
  if (feed.title) {
    document.title = feed.title;
    document.querySelector('.brand-title').textContent = feed.title;
  }
  render();
}

let loading = null;
/** One fetch at a time: the first load and a quick return to the app must not both draw the page */
function load() {
  loading ??= fetchFeed().finally(() => {
    loading = null;
  });
  return loading;
}

/** First load shows the feed; later loads (coming back to the app) only offer a newer one */
async function fetchFeed() {
  let feed;
  try {
    const res = await fetch('./feed.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status === 404 ? t('load.missing') : `HTTP ${res.status}`);
    feed = await res.json();
  } catch (err) {
    // A failed refresh keeps the stories already on the page
    if (!data.feed) {
      loadError = err;
      render();
    }
    return;
  }
  loadError = null;
  if (!data.feed) {
    showFeed(feed);
    return;
  }
  if (feed.generatedAt === data.feed.generatedAt) return;
  pendingFeed = feed;
  // An Undo still on screen wins; the newer edition is offered again on the next return
  if (!$('toast').hidden && !$('toast-action').hidden) return;
  toast(t('update.ready'), {
    label: t('update.show'),
    run: () => {
      showFeed(pendingFeed);
      window.scrollTo(0, 0);
    },
  });
}

/** Draws one story again in place (read mark, bookmark), leaving the rest of the page where it is */
function redraw(key) {
  const entries = views.get(key) ?? [];
  views.set(key, []);
  for (const { li, story, idPrefix, options } of entries) {
    const focusable = (el) => [...el.querySelectorAll('a, button')];
    const focused = focusable(li).indexOf(document.activeElement);
    const next = storyItem(story, idPrefix, options);
    li.replaceWith(next);
    if (focused >= 0) focusable(next)[focused]?.focus();
  }
}

function act(action, story) {
  const key = story.key;
  const s = data.state;
  if (action === 'read') s.read = [...s.read.filter((k) => k !== key), key];
  // Save the whole story so it is still there after the feed changes tomorrow
  if (action === 'later') s.later = [story, ...s.later.filter((x) => x.key !== key)];
  if (action === 'unlater') s.later = s.later.filter((x) => x.key !== key);
  saveState();
  renderHeader();
  if (action === 'unlater' && currentTab() === 'later') render();
  else redraw(key);
}

/** Opening a story from Read later is the point of saving it, so it leaves the list (with Undo) */
function readFromLater(story) {
  const s = data.state;
  const index = s.later.findIndex((x) => x.key === story.key);
  s.read = [...s.read.filter((k) => k !== story.key), story.key];
  s.later = s.later.filter((x) => x.key !== story.key);
  saveState();
  // A link taken out of the page still opens, so the list can be redrawn right away
  render();
  toast(t('later.done'), {
    label: t('undo'),
    run: () => {
      // Another tab may have changed the list meanwhile
      if (s.later.some((x) => x.key === story.key)) return;
      s.later.splice(Math.min(index, s.later.length), 0, story);
      saveState();
      render();
    },
  });
}

function mute(rules, { undo = true } = {}) {
  const m = data.state.mute;
  m.domains = [...new Set([...m.domains, ...rules.domains])];
  m.keywords = [...new Set([...m.keywords, ...rules.keywords])];
  saveState();
  render();
  const label = [...rules.domains, ...rules.keywords].join(t('list.separator'));
  toast(t('mute.done', { label }), undo ? { label: t('undo'), run: () => unmute(rules, { quiet: true }) } : undefined);
}

function unmute(rules, { quiet = false } = {}) {
  const m = data.state.mute;
  m.domains = m.domains.filter((d) => !rules.domains.includes(d));
  m.keywords = m.keywords.filter((k) => !rules.keywords.includes(k));
  saveState();
  render();
  if (!quiet) toast(t('mute.removed'));
}

let toastTimer = null;
function toast(text, action) {
  const el = $('toast');
  $('toast-text').textContent = text;
  const btn = $('toast-action');
  btn.hidden = !action;
  btn.onclick = null;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => {
      el.hidden = true;
      action.run();
    };
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 2800);
}

/** The saved choice, or null to follow the system */
function savedTheme() {
  try {
    const theme = localStorage.getItem('theme');
    return theme === 'light' || theme === 'dark' ? theme : null;
  } catch {
    return null;
  }
}

const isDark = () =>
  (savedTheme() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';

function applyTheme() {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme').setAttribute('aria-pressed', String(dark));
  // Match the browser UI color (the address bar on phones)
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', dark ? '#0e1014' : '#f5f6f8');
  }
}

function toggleTheme() {
  try {
    localStorage.setItem('theme', isDark() ? 'light' : 'dark');
  } catch {}
  applyTheme();
}

function currentTab() {
  const tab = location.hash.replace('#', '');
  return tab === 'later' || tab === 'settings' ? tab : 'today';
}

function renderHeader() {
  const { feed } = data;
  const meta = $('meta');
  if (feed) {
    meta.textContent = t('updated', { date: formatDate(feed.date), time: formatTime(feed.generatedAt) });
  } else meta.textContent = '';

  const total = feed ? visibleSections(feed).reduce((n, s) => n + s.stories.length, 0) : 0;
  $('count-today').textContent = total ? String(total) : '';
  $('count-later').textContent = data.state.later.length ? String(data.state.later.length) : '';
  const muteCount = data.state.mute.keywords.length + data.state.mute.domains.length;
  $('count-mute').textContent = muteCount ? String(muteCount) : '';

  const tab = currentTab();
  for (const a of document.querySelectorAll('.tab')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function renderSectionNav(sections) {
  const nav = $('section-nav');
  nav.replaceChildren(
    ...sections.map((s) =>
      h(
        'a',
        { class: 'chip', href: `#section-${s.id}`, onclick: (e) => jumpTo(e, s.id) },
        sectionTitle(s),
        h('span', { class: 'chip-count' }, s.stories.length),
      ),
    ),
  );
}

function jumpTo(event, id) {
  event.preventDefault();
  const target = document.getElementById(`section-${id}`);
  if (!target) return;
  target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  target.querySelector('h2')?.focus({ preventScroll: true });
}

/** Where the story is popular, e.g. "HN 668 pt", linking to the discussion when there is one */
function source(a, story) {
  const label = LOCALIZED_SOURCES.has(a.source) ? t(`source.${a.source}`) : (SOURCE_LABELS[a.source] ?? a.source);
  const children = [h('span', { class: 'source-dot' }), label];
  if (a.score !== null && a.score !== undefined) {
    // The unit (pt, likes…) is only in the accessible name; on screen the number next to the site is enough
    const star = a.scoreLabel === '★' ? '★' : '';
    children.push(' ', h('span', { class: 'source-score' }, `${star}${formatScore(a.score)}`));
  }
  const href = a.discussionUrl ? safeUrl(a.discussionUrl) : null;
  if (!href) {
    const title = a.score === null || a.score === undefined ? undefined : `${a.score} ${a.scoreLabel ?? ''}`.trim();
    return h('span', { class: 'source', title, translate: 'no', dataset: { source: a.source } }, ...children);
  }
  return h(
    'a',
    {
      class: 'source',
      translate: 'no',
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      dataset: { source: a.source },
      // Reading the discussion counts as reading the story
      onclick: () => markRead(story),
      'aria-label': t('discussion', { source: label, score: `${a.score ?? ''} ${a.scoreLabel ?? ''}`.trim() }),
    },
    ...children,
    icon('comment'),
  );
}

/** What people said about the story: a couple of comments, translated when the browser can, and a link to the rest */
function voicesOf(story) {
  const v = story.voices;
  const href = v ? safeUrl(v.url) : null;
  if (!href || !Array.isArray(v.comments) || v.comments.length === 0) return null;
  const site = LOCALIZED_SOURCES.has(v.source) ? t(`source.${v.source}`) : (SOURCE_LABELS[v.source] ?? v.source);
  return h(
    'div',
    { class: 'voices' },
    v.comments.map((c, i) => {
      const id = `${story.key}#${i}`;
      const open = openVoices.has(id);
      const translation = translationOf(c, language(), () => redraw(story.key));
      return h(
        'button',
        {
          class: `voice${open ? ' is-open' : ''}`,
          type: 'button',
          'aria-expanded': String(open),
          onclick: () => {
            if (open) openVoices.delete(id);
            else openVoices.add(id);
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
    }),
    h(
      'a',
      {
        class: 'voices-more',
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        translate: 'no',
        onclick: () => markRead(story),
      },
      t('voices.more', { source: site, n: formatScore(v.count) }),
    ),
  );
}

function markRead(story) {
  if (!data.state.read.includes(story.key)) act('read', story);
}

/** One story as an <article> named by its title. idPrefix keeps the heading ids unique on the page. */
function storyItem(story, idPrefix, options = {}) {
  const s = data.state;
  const later = s.later.some((x) => x.key === story.key);
  const read = s.read.includes(story.key);
  const href = safeUrl(story.url);
  const official = story.appearances.every((a) => a.source === 'official');

  const titleId = `${idPrefix}-title`;
  const translation = translationOf({ lang: story.lang, text: story.title }, language(), () => redraw(story.key));
  const titleText = [
    h('span', { lang: story.lang }, story.title),
    translation ? h('span', { class: 'story-translation', lang: language() }, translation) : null,
  ];
  const title = h(
    'h3',
    { class: 'story-title', id: titleId },
    href
      ? h(
          'a',
          {
            class: 'story-link',
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
            onclick: () => (options.fromLater ? readFromLater(story) : markRead(story)),
          },
          titleText,
        )
      : titleText,
  );

  const meta = h(
    'div',
    { class: 'story-meta' },
    // Read state is shown by dimming; say it in words too, for screen readers
    read ? h('span', { class: 'visually-hidden' }, t('read')) : null,
    official
      ? h(
          'span',
          { class: 'source', dataset: { source: 'official' } },
          h('span', { class: 'source-dot' }),
          story.publisher ?? t('source.official'),
        )
      : story.appearances.map((a) => source(a, story)),
    ['major', 'minor', 'patch'].includes(story.releaseKind)
      ? h(
          'span',
          { class: `tag${story.releaseKind === 'major' ? ' tag-accent' : ''}` },
          t(`release.${story.releaseKind}`),
        )
      : null,
    story.resurfaced ? h('span', { class: 'tag tag-accent' }, t('resurfaced')) : null,
    story.groupedCount ? h('span', {}, t('grouped', { n: story.groupedCount })) : null,
    official ? null : h('span', { class: 'story-domain', translate: 'no' }, story.domain),
    story.publishedAt ? h('time', { datetime: story.publishedAt }, timeAgo(story.publishedAt)) : null,
  );

  const actions = h(
    'div',
    { class: 'story-actions' },
    h(
      'button',
      {
        class: 'action action-later',
        type: 'button',
        'aria-pressed': String(later),
        'aria-label': t(later ? 'unlater' : 'later'),
        title: t('later'),
        onclick: () => act(later ? 'unlater' : 'later', story),
      },
      icon('later'),
    ),
    h(
      'button',
      {
        class: 'action',
        type: 'button',
        'aria-label': t('mute'),
        title: t('mute'),
        onclick: () => openMuteSheet(story),
      },
      icon('mute'),
    ),
  );

  const li = h(
    'li',
    {},
    h(
      'article',
      { class: `story${read ? ' is-read' : ''}`, 'aria-labelledby': titleId },
      title,
      voicesOf(story),
      h('div', { class: 'story-footer' }, meta, actions),
    ),
  );
  views.set(story.key, [...(views.get(story.key) ?? []), { li, story, idPrefix, options }]);
  return li;
}

function emptyState(title, text) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), h('p', {}, text));
}

function renderToday(main) {
  const { feed } = data;
  if (!feed) {
    if (loadError) {
      main.append(emptyState(t('load.failedTitle'), loadError.message));
      return;
    }
    main.append(
      h(
        'ul',
        { class: 'stories', 'aria-hidden': 'true' },
        [1, 2, 3].map(() => h('li', { class: 'skeleton' })),
      ),
    );
    return;
  }

  const sections = visibleSections(feed).filter((s) => s.stories.length > 0);
  renderSectionNav(sections);
  if (sections.length === 0) {
    main.append(emptyState(t('empty.today'), t('empty.today.text')));
  }
  for (const section of sections) {
    const description =
      section.title === undefined ? t(`section.${section.id}.desc`, { days: feed.officialDays ?? 3 }) : null;
    main.append(
      h(
        'section',
        { class: 'section', id: `section-${section.id}`, 'aria-labelledby': `title-${section.id}` },
        h(
          'div',
          { class: 'section-header' },
          h('h2', { class: 'section-title', id: `title-${section.id}`, tabindex: '-1' }, sectionTitle(section)),
          description ? h('p', { class: 'section-description' }, description) : null,
        ),
        // role="list": Safari drops list semantics from lists styled with list-style: none
        h(
          'ul',
          { class: 'stories', role: 'list' },
          section.stories.map((story, i) => storyItem(story, `${section.id}-${i}`)),
        ),
        section.more > 0
          ? h(
              'button',
              {
                class: 'more',
                type: 'button',
                onclick: () => {
                  expanded.add(section.id);
                  render();
                  // Keyboard and screen reader users continue at the first story that just appeared
                  const revealed = $(`section-${section.id}`)?.querySelectorAll('.story-link')[section.stories.length];
                  revealed?.focus({ preventScroll: true });
                },
              },
              t('more', { n: section.more }),
            )
          : null,
      ),
    );
  }
  if (feed.errors?.length) {
    main.append(
      h('p', { class: 'notice' }, t('errors', { sources: feed.errors.map((e) => e.source).join(t('list.separator')) })),
    );
  }
}

function renderLater(main) {
  $('section-nav').replaceChildren();
  const list = data.state.later;
  if (list.length === 0) {
    main.append(emptyState(t('empty.later'), t('empty.later.text')));
    return;
  }
  main.append(
    h(
      'section',
      { class: 'section', 'aria-label': t('tab.later') },
      h(
        'ul',
        { class: 'stories', role: 'list' },
        list.map((story, i) => storyItem(story, `later-${i}`, { fromLater: true })),
      ),
    ),
  );
}

function renderSettings(main) {
  $('section-nav').replaceChildren();
  const { keywords, domains } = data.state.mute;
  const items = [
    ...domains.map((v) => ({ kind: 'domain', value: v })),
    ...keywords.map((v) => ({ kind: 'keyword', value: v })),
  ];
  const section = h('section', { class: 'section', 'aria-label': t('tab.mute') });
  if (items.length === 0) {
    section.append(emptyState(t('empty.mute'), t('empty.mute.text')));
  } else {
    section.append(
      h(
        'ul',
        { class: 'mute-list', role: 'list' },
        items.map((item) =>
          h(
            'li',
            { class: 'mute-item' },
            h(
              'span',
              { class: 'mute-item-label' },
              h('span', { class: 'mute-kind' }, t(`mute.kind.${item.kind}`)),
              item.value,
            ),
            h(
              'button',
              {
                class: 'button button-small',
                type: 'button',
                // Several rows have the same visible "Unmute"; the name says which one
                'aria-label': t('mute.unmuteItem', { value: item.value }),
                onclick: () =>
                  unmute(
                    item.kind === 'domain'
                      ? { domains: [item.value], keywords: [] }
                      : { keywords: [item.value], domains: [] },
                  ),
              },
              t('mute.unmute'),
            ),
          ),
        ),
      ),
    );
  }
  section.append(h('p', { class: 'help' }, t('mute.help')));
  main.append(section);
}

function render() {
  renderHeader();
  const main = $('main');
  main.replaceChildren();
  views.clear();
  const tab = currentTab();
  if (tab === 'later') renderLater(main);
  else if (tab === 'settings') renderSettings(main);
  else renderToday(main);
}

function openMuteSheet(story) {
  const dialog = $('mute-sheet');
  $('mute-story').textContent = story.title;
  $('mute-story').lang = story.lang ?? '';
  $('mute-custom').value = '';
  const options = [];
  if (story.domain)
    options.push({ kind: 'domain', value: story.domain, label: t('mute.option.domain', { value: story.domain }) });
  const keywords = [...new Set([...story.matchedKeywords, ...story.tags])].slice(0, 8);
  for (const k of keywords) options.push({ kind: 'keyword', value: k, label: t('mute.option.keyword', { value: k }) });

  $('mute-options').replaceChildren(
    h('legend', { class: 'field-label' }, t('mute.candidates')),
    ...options.map((o) =>
      h(
        'label',
        { class: 'mute-option' },
        h('input', { type: 'checkbox', name: o.kind, value: o.value }),
        h('span', { class: 'mute-option-text' }, o.label),
      ),
    ),
  );
  dialog.returnValue = '';
  dialog.showModal();
}

function setupMuteSheet() {
  const dialog = $('mute-sheet');
  // Tapping outside the sheet (the backdrop) closes it
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close('cancel');
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'mute') return;
    const checked = [...dialog.querySelectorAll('input[type="checkbox"]:checked')];
    const domains = checked.filter((i) => i.name === 'domain').map((i) => i.value);
    const custom = $('mute-custom')
      .value.split(/[,\u3001]/) // ASCII comma or the Japanese comma
      .map((s) => s.trim())
      .filter(Boolean);
    const keywords = [...checked.filter((i) => i.name === 'keyword').map((i) => i.value), ...custom];
    if (domains.length + keywords.length === 0) {
      toast(t('mute.none'));
      return;
    }
    mute({ domains, keywords });
  });
}

translateDocument();
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
$('theme').addEventListener('click', toggleTheme);
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
// Check for a newer edition when the app comes back to the foreground (e.g. reopened on the commute)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load();
});
// Pick up mutes etc. changed in another tab
window.addEventListener('storage', (e) => {
  if (e.key !== STATE_KEY) return;
  data.state = loadState();
  render();
});
setupMuteSheet();
load();
