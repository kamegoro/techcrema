// Applies the saved theme before first paint to avoid a light-to-dark flash.
// (A separate file because the CSP forbids inline scripts.)
try {
  const t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {}
