// テーマの初期適用。描画前に同期で読み込んで、ライト→ダークのちらつきを防ぐ。
// (CSPでインラインスクリプトを禁止しているため、別ファイルにしている)
try {
  const t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {}
