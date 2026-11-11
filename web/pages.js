// The header and the three screens: Today, Read later and Muted.
import { $, emptyState, h } from './dom.js';
import { sectionTitle } from './feed.js';
import { formatDate, formatTime, t } from './i18n.js';

export function currentTab() {
  const tab = location.hash.replace('#', '');
  return tab === 'later' || tab === 'settings' ? tab : 'today';
}

const countText = (n) => (n ? String(n) : '');

export function renderHeader({ feed, sections, state }) {
  $('meta').textContent = feed ? t('updated', { date: formatDate(feed.date), time: formatTime(feed.generatedAt) }) : '';
  $('count-today').textContent = countText(sections.reduce((n, s) => n + s.stories.length, 0));
  $('count-later').textContent = countText(state.later.length);
  $('count-mute').textContent = countText(state.mute.keywords.length + state.mute.domains.length);
  const tab = currentTab();
  for (const link of document.querySelectorAll('.tab')) {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  renderFooter(feed);
}

/** What the page is, who runs it, and where to ask for something to be taken down */
function renderFooter(feed) {
  const repo = /^[\w.-]+\/[\w.-]+$/.test(feed?.repository ?? '') ? feed.repository : null;
  $('page-footer').replaceChildren(
    ...(feed
      ? [
          h('p', {}, t('footer.about')),
          repo ? h('p', {}, t('footer.owner', { repo })) : null,
          repo
            ? h(
                'p',
                {},
                h(
                  'a',
                  { href: `https://github.com/${repo}/issues`, target: '_blank', rel: 'noopener noreferrer' },
                  t('footer.contact'),
                ),
              )
            : null,
        ]
      : []),
  );
}

function jumpTo(event, id) {
  event.preventDefault();
  const target = document.getElementById(`section-${id}`);
  if (!target) return;
  target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  target.querySelector('h2')?.focus({ preventScroll: true });
}

function renderSectionNav(sections) {
  $('section-nav').replaceChildren(
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

const loadingPlaceholder = () =>
  h(
    'ul',
    { class: 'stories', 'aria-hidden': 'true' },
    [1, 2, 3].map(() => h('li', { class: 'skeleton' })),
  );

// role="list": Safari drops list semantics from lists styled with list-style: none
const storyList = (items) => h('ul', { class: 'stories', role: 'list' }, items);

function section(feed, s, storyItem, showMore) {
  const description = s.title === undefined ? t(`section.${s.id}.desc`, { days: feed.officialDays ?? 3 }) : null;
  return h(
    'section',
    { class: 'section', id: `section-${s.id}`, 'aria-labelledby': `title-${s.id}` },
    h(
      'div',
      { class: 'section-header' },
      h('h2', { class: 'section-title', id: `title-${s.id}`, tabindex: '-1' }, sectionTitle(s)),
      description ? h('p', { class: 'section-description' }, description) : null,
    ),
    storyList(s.stories.map((story, i) => storyItem(story, `${s.id}-${i}`))),
    s.more > 0
      ? h('button', { class: 'more', type: 'button', onclick: () => showMore(s) }, t('more', { n: s.more }))
      : null,
  );
}

export function renderToday(main, { feed, sections, loadError, storyItem, showMore }) {
  if (!feed) {
    main.append(loadError ? emptyState(t('load.failedTitle'), loadError.message) : loadingPlaceholder());
    return;
  }
  const withStories = sections.filter((s) => s.stories.length > 0);
  renderSectionNav(withStories);
  if (withStories.length === 0) main.append(emptyState(t('empty.today'), t('empty.today.text')));
  for (const s of withStories) main.append(section(feed, s, storyItem, showMore));
  if (feed.errors?.length) {
    const sources = feed.errors.map((e) => e.source).join(t('list.separator'));
    main.append(h('p', { class: 'notice' }, t('errors', { sources })));
  }
}

export function renderLater(main, { state, storyItem }) {
  $('section-nav').replaceChildren();
  if (state.later.length === 0) {
    main.append(emptyState(t('empty.later'), t('empty.later.text')));
    return;
  }
  main.append(
    h(
      'section',
      { class: 'section', 'aria-label': t('tab.later') },
      storyList(state.later.map((story, i) => storyItem(story, `later-${i}`, { fromLater: true }))),
    ),
  );
}

function muteItem(item, unmute) {
  const rules =
    item.kind === 'domain' ? { domains: [item.value], keywords: [] } : { keywords: [item.value], domains: [] };
  return h(
    'li',
    { class: 'mute-item' },
    h('span', { class: 'mute-item-label' }, h('span', { class: 'mute-kind' }, t(`mute.kind.${item.kind}`)), item.value),
    h(
      'button',
      {
        class: 'button button-small',
        type: 'button',
        // Every row's button says "Unmute"; its name says which one
        'aria-label': t('mute.unmuteItem', { value: item.value }),
        onclick: () => unmute(rules),
      },
      t('mute.unmute'),
    ),
  );
}

export function renderMuted(main, { state, unmute }) {
  $('section-nav').replaceChildren();
  const items = [
    ...state.mute.domains.map((value) => ({ kind: 'domain', value })),
    ...state.mute.keywords.map((value) => ({ kind: 'keyword', value })),
  ];
  const content =
    items.length === 0
      ? emptyState(t('empty.mute'), t('empty.mute.text'))
      : h(
          'ul',
          { class: 'mute-list', role: 'list' },
          items.map((item) => muteItem(item, unmute)),
        );
  main.append(
    h('section', { class: 'section', 'aria-label': t('tab.mute') }, content, h('p', { class: 'help' }, t('mute.help'))),
  );
}
