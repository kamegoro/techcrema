// UI strings. The language comes from the `language` option (written into the page and feed.json).

const MESSAGES = {
  en: {
    'meta.description': 'Trending tech stories that match your interests, on one page a day',
    skip: 'Skip to content',
    'theme.toggle': 'Dark mode',
    tabs: 'Views',
    'tab.today': 'Today',
    'tab.later': 'Later',
    'tab.mute': 'Muted',
    sections: 'Sections',
    'section.official': 'Official',
    'section.official.desc': 'Blogs and releases from the last {days} days',
    'section.trending': 'Elsewhere',
    'section.trending.desc': 'Outside your topics, but among the most popular today',
    'section.repos': 'New repos',
    'section.repos.desc': 'Created in the last 7 days and gaining stars',
    'source.hatena': 'Hatena',
    slides: 'Slides',
    'voices.more': 'All {n} reactions on {source}',
    'voice.whole': 'Whole comment by {author}',
    'footer.about':
      'Titles and links of popular stories, with short parts of public comments, gathered automatically for personal reading.',
    'footer.owner': 'Run by the owner of {repo}.',
    'footer.contact': 'To have something removed, open an issue',
    'source.official': 'Official',
    'release.major': 'Major',
    'release.minor': 'Minor',
    'release.patch': 'Patch',
    updated: '{date} · updated {time}',
    grouped: 'and {n} more',
    more: 'Show {n} more',
    resurfaced: 'Back again',
    read: 'Read',
    discussion: 'Discussion on {source} ({score})',
    later: 'Read later',
    unlater: 'Remove from Read later',
    mute: 'Mute',
    'load.missing': 'The feed has not been generated yet',
    'load.failedTitle': 'Could not load the feed',
    'empty.today': 'Nothing new today',
    'empty.today.text': 'The next scheduled update will bring more',
    'empty.later': 'Nothing saved for later',
    'empty.later.text': 'Use the bookmark button on a story',
    'empty.mute': 'Nothing muted',
    'empty.mute.text': 'Use the mute button on a story',
    errors: 'Could not fetch: {sources}',
    'mute.kind.domain': 'Site',
    'mute.kind.keyword': 'Keyword',
    'mute.option.domain': 'Site: {value}',
    'mute.option.keyword': 'Keyword: {value}',
    'mute.unmute': 'Unmute',
    'mute.unmuteItem': 'Unmute {value}',
    'mute.title': 'What do you want to mute?',
    'mute.candidates': 'Suggestions',
    'mute.custom': 'Add keywords',
    'mute.placeholder': 'e.g. Rust, LLM',
    'mute.cancel': 'Cancel',
    'mute.submit': 'Mute',
    'mute.none': 'Nothing selected to mute',
    'mute.done': 'Muted "{label}"',
    undo: 'Undo',
    'later.done': 'Removed from Read later',
    'update.ready': 'A newer edition is ready',
    'update.show': 'Show',
    'mute.removed': 'Unmuted',
    'mute.help':
      'Read later, read marks and mutes are saved in this browser only. To change your topics, edit the workflow or techcrema.yml in your repository.',
    'save.failed': 'Could not save in this browser (private browsing does not keep data)',
    'list.separator': ', ',
  },
  ja: {
    'meta.description': '人気かつ自分の関心に合う技術記事を毎日1ページに',
    skip: '本文へ移動',
    'theme.toggle': 'ダークモード',
    tabs: '表示切り替え',
    'tab.today': '今日',
    'tab.later': 'あとで',
    'tab.mute': 'ミュート',
    sections: 'セクション',
    'section.official': '公式',
    'section.official.desc': '公式ブログとリリース({days}日以内の新着)',
    'section.trending': 'そのほかの話題',
    'section.trending.desc': '関心ごと以外で、今日特に人気のもの',
    'section.repos': '新しいリポジトリ',
    'section.repos.desc': '直近7日に作られ、スターを集めているもの',
    'source.hatena': 'はてブ',
    slides: 'スライド',
    'voices.more': '{source}の反応 {n}件をすべて見る',
    'voice.whole': '{author} さんのコメント全文',
    'footer.about':
      '話題の記事のタイトル・リンクと、公開されているコメントの一部を、個人で読むために自動で集めたページです。',
    'footer.owner': '運営は {repo} の持ち主が行っています。',
    'footer.contact': '掲載内容の削除のご依頼は Issue へ',
    'source.official': '公式',
    'release.major': 'メジャー',
    'release.minor': 'マイナー',
    'release.patch': 'パッチ',
    updated: '{date} · {time} 更新',
    grouped: 'ほか{n}件',
    more: 'さらに{n}件',
    resurfaced: '再浮上',
    read: '既読',
    discussion: '{source}の議論ページ({score})',
    later: 'あとで読む',
    unlater: 'あとで読むから外す',
    mute: 'ミュート',
    'load.missing': 'まだフィードが作られていません',
    'load.failedTitle': 'フィードを読み込めません',
    'empty.today': '今日の新着はありません',
    'empty.today.text': '次の自動更新をお待ちください',
    'empty.later': '「あとで読む」は空です',
    'empty.later.text': '記事のしおりボタンで追加できます',
    'empty.mute': 'ミュートはありません',
    'empty.mute.text': '記事のミュートボタンから追加できます',
    errors: '取得できなかった情報源: {sources}',
    'mute.kind.domain': 'サイト',
    'mute.kind.keyword': 'キーワード',
    'mute.option.domain': 'サイト: {value}',
    'mute.option.keyword': 'キーワード: {value}',
    'mute.unmute': '解除',
    'mute.unmuteItem': '{value} のミュートを解除',
    'mute.title': '何をミュートしますか?',
    'mute.candidates': '候補',
    'mute.custom': 'キーワードを追加',
    'mute.placeholder': '例: Rust, LLM',
    'mute.cancel': 'キャンセル',
    'mute.submit': 'ミュートする',
    'mute.none': 'ミュートする対象が選ばれていません',
    'mute.done': '「{label}」をミュートしました',
    undo: '元に戻す',
    'later.done': '「あとで」から外しました',
    'update.ready': '新しい版があります',
    'update.show': '表示',
    'mute.removed': 'ミュートを解除しました',
    'mute.help':
      'あとで読む・既読・ミュートは、このブラウザにだけ保存されます。関心のあるトピックは、リポジトリのワークフローか techcrema.yml で変更できます。',
    'save.failed': 'このブラウザに保存できませんでした(プライベートモードでは保存されません)',
    'list.separator': '、',
  },
};

// The build writes the feed's language into <html lang>, so the first paint is already right.
// When opening web/ without a build, fall back to the browser's language.
let lang = initialLanguage();

function initialLanguage() {
  const fromPage = document.documentElement.lang;
  if (fromPage && fromPage in MESSAGES) return fromPage;
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/** The language the page is shown in ('en' or 'ja') */
export const language = () => lang;

export function setLanguage(next) {
  if (!(next in MESSAGES) || next === lang) return false;
  lang = next;
  return true;
}

export function t(key, vars = {}) {
  const text = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

/** Fills the static HTML: data-i18n (text), data-i18n-label (aria-label + title), data-i18n-aria (aria-label), data-i18n-placeholder */
export function translateDocument() {
  document.documentElement.lang = lang;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
  for (const el of document.querySelectorAll('[data-i18n]')) {
    // Keep child elements (e.g. tab counters) and replace only the leading text
    const first = el.firstChild;
    if (first?.nodeType === Node.TEXT_NODE) first.textContent = t(el.dataset.i18n);
    else el.prepend(t(el.dataset.i18n));
  }
  for (const el of document.querySelectorAll('[data-i18n-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nLabel));
    el.setAttribute('title', t(el.dataset.i18nLabel));
  }
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  }
}

export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  if (Number.isNaN(seconds)) return '';
  // Narrow ("21h ago", "21時間前") keeps a story's details on one line on a phone
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'narrow' });
  if (seconds < 60) return rtf.format(0, 'second');
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
  if (seconds < 86400 * 30) return rtf.format(-Math.floor(seconds / 86400), 'day');
  return new Date(iso).toLocaleDateString(lang, { month: 'short', day: 'numeric' });
}

export function formatDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang, { month: 'long', day: 'numeric', weekday: 'short' });
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
}
