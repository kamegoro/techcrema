import { $ } from './dom.js';

/** The reader's choice, or null to follow the system */
function savedTheme() {
  try {
    const theme = localStorage.getItem('theme');
    return theme === 'light' || theme === 'dark' ? theme : null;
  } catch {
    return null;
  }
}

const systemDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (savedTheme() ?? (systemDark.matches ? 'dark' : 'light')) === 'dark';

function applyTheme() {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme').setAttribute('aria-pressed', String(dark));
  // The browser's own bars (the address bar on phones) follow the page
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

export function setUpTheme() {
  applyTheme();
  systemDark.addEventListener('change', applyTheme);
  $('theme').addEventListener('click', toggleTheme);
}
