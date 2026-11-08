// UI strings. The language comes from the `language` option (written into the page and feed.json).

const MESSAGES = {
  en: {
    'meta.description': 'Trending tech stories that match your interests, on one page a day',
    'skip': 'Skip to content',
    'reload': 'Reload',
    'theme.toggle': 'Toggle theme',
    'theme.label': 'Theme: {mode} (tap to change)',
    'theme.toast': 'Theme: {mode}',
    'theme.system': 'System',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'tabs': 'Views',
    'tab.today': 'Today',
    'tab.later': 'Later',
    'tab.mute': 'Muted',
    'sections': 'Sections',
    'section.official': 'Official',
    'section.official.desc': 'Blogs and releases from the last {days} days',
    'section.forYou': 'For you',
    'section.forYou.desc': 'Matches your interests, most popular first',
    'section.trending': 'Trending',
    'section.trending.desc': 'Outside your interests, but top 3% on its platform',
    'section.discover': 'Discover',
    'section.discover.desc': 'A daily random pick from outside your interests',
    'section.repos': 'New repos',
    'section.repos.desc': 'Created in the last 7 days and gaining stars',
    'source.hatena': 'Hatena',
    'source.official': 'Official',
    'release.major': 'Major',
    'release.minor': 'Minor',
    'release.patch': 'Patch',
    'updated': '{date} · updated {time}',
    'grouped': '+{n} more',
    'resurfaced': 'Back again',
    'language': 'Language',
    'discussion': 'Discussion on {source} ({score})',
    'like': 'Like',
    'unlike': 'Remove like',
    'later': 'Read later',
    'unlater': 'Remove from Read later',
    'mute': 'Mute',
    'load.missing': 'The feed has not been generated yet',
    'load.failed': 'Could not load: {message}',
    'load.failedTitle': 'Could not load the feed',
    'load.latest': 'Already up to date',
    'load.updated': 'Updated',
    'empty.today': 'Nothing new today',
    'empty.today.text': 'The next scheduled update will bring more',
    'empty.later': 'Nothing saved for later',
    'empty.later.text': 'Use the bookmark button on a card',
    'empty.mute': 'Nothing muted',
    'empty.mute.text': 'Use the mute button on a card',
    'errors': 'Could not fetch: {sources}',
    'mute.kind.domain': 'Site',
    'mute.kind.keyword': 'Keyword',
    'mute.option.domain': 'Site: {value}',
    'mute.option.keyword': 'Keyword: {value}',
    'mute.unmute': 'Unmute',
    'mute.title': 'What do you want to mute?',
    'mute.candidates': 'Suggestions',
    'mute.custom': 'Add keywords',
    'mute.placeholder': 'e.g. Rust, LLM',
    'mute.cancel': 'Cancel',
    'mute.submit': 'Mute',
    'mute.none': 'Nothing selected to mute',
    'mute.done': 'Muted "{label}"',
    'mute.undo': 'Undo',
    'mute.removed': 'Unmuted',
    'mute.help': 'Likes, Read later and mutes are saved in this browser only. To change your topics, edit the workflow or tech-catchup.yml in your repository.',
    'save.failed': 'Could not save in this browser (private browsing does not keep data)',
    'list.separator': ', ',
  },
  ja: {
    'meta.description': '人気かつ自分の関心に合う技術記事を毎日1ページに',
    'skip': '本文へ移動',
    'reload': '再読み込み',
    'theme.toggle': 'テーマ切り替え',
    'theme.label': 'テーマ: {mode}(タップで切り替え)',
    'theme.toast': 'テーマ: {mode}',
    'theme.system': 'システム',
    'theme.light': 'ライト',
    'theme.dark': 'ダーク',
    'tabs': '表示切り替え',
    'tab.today': '今日',
    'tab.later': 'あとで',
    'tab.mute': 'ミュート',
    'sections': 'セクション',
    'section.official': '公式',
    'section.official.desc': '公式ブログとリリース({days}日以内の新着)',
    'section.forYou': 'あなた向け',
    'section.forYou.desc': '関心に合う記事を人気順に',
    'section.trending': '話題',
    'section.trending.desc': '関心外だが各プラットフォームで上位3%',
    'section.discover': '発見',
    'section.discover.desc': '関心外から日替わりで',
    'section.repos': '新しいリポジトリ',
    'section.repos.desc': '直近7日に作られ、スターを集めているもの',
    'source.hatena': 'はてブ',
    'source.official': '公式',
    'release.major': 'メジャー',
    'release.minor': 'マイナー',
    'release.patch': 'パッチ',
    'updated': '{date} · {time} 更新',
    'grouped': 'ほか{n}件',
    'resurfaced': '再浮上',
    'language': '言語',
    'discussion': '{source}の議論ページ({score})',
    'like': 'いいね',
    'unlike': 'いいねを取り消す',
    'later': 'あとで読む',
    'unlater': 'あとで読むから外す',
    'mute': 'ミュート',
    'load.missing': 'まだフィードが作られていません',
    'load.failed': '読み込めませんでした: {message}',
    'load.failedTitle': 'フィードを読み込めません',
    'load.latest': '最新の状態です',
    'load.updated': '更新しました',
    'empty.today': '今日の新着はありません',
    'empty.today.text': '次の自動更新をお待ちください',
    'empty.later': '「あとで読む」は空です',
    'empty.later.text': 'カードのしおりボタンで追加できます',
    'empty.mute': 'ミュートはありません',
    'empty.mute.text': 'カードのミュートボタンから追加できます',
    'errors': '取得できなかった情報源: {sources}',
    'mute.kind.domain': 'サイト',
    'mute.kind.keyword': 'キーワード',
    'mute.option.domain': 'サイト: {value}',
    'mute.option.keyword': 'キーワード: {value}',
    'mute.unmute': '解除',
    'mute.title': '何をミュートしますか?',
    'mute.candidates': '候補',
    'mute.custom': 'キーワードを追加',
    'mute.placeholder': '例: Rust, LLM',
    'mute.cancel': 'キャンセル',
    'mute.submit': 'ミュートする',
    'mute.none': 'ミュートする対象が選ばれていません',
    'mute.done': '「{label}」をミュートしました',
    'mute.undo': '元に戻す',
    'mute.removed': 'ミュートを解除しました',
    'mute.help': 'いいね・あとで読む・ミュートは、このブラウザにだけ保存されます。関心のあるトピックは、リポジトリのワークフローか tech-catchup.yml で変更できます。',
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

export function getLanguage() {
  return lang;
}

/** Returns true when the language changed */
export function setLanguage(next) {
  if (!(next in MESSAGES) || next === lang) return false;
  lang = next;
  return true;
}

export function t(key, vars = {}) {
  const text = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

/** Fills the static HTML: data-i18n (text), data-i18n-label (aria-label + title), data-i18n-placeholder */
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
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  }
}

export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  if (Number.isNaN(seconds)) return '';
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
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
