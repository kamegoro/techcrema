// The sheet that offers what to mute for a story: its site, its keywords, or words the reader types.
import { $, h } from './dom.js';
import { t } from './i18n.js';

export function openMuteSheet(story) {
  $('mute-story').textContent = story.title;
  $('mute-story').lang = story.lang ?? '';
  $('mute-custom').value = '';
  const options = [];
  if (story.domain) {
    options.push({ kind: 'domain', value: story.domain, label: t('mute.option.domain', { value: story.domain }) });
  }
  for (const keyword of [...new Set([...story.matchedKeywords, ...story.tags])].slice(0, 8)) {
    options.push({ kind: 'keyword', value: keyword, label: t('mute.option.keyword', { value: keyword }) });
  }
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
  const sheet = $('mute-sheet');
  sheet.returnValue = '';
  sheet.showModal();
}

/** `onMute({ domains, keywords })` gets what was chosen, possibly nothing */
export function setUpMuteSheet(onMute) {
  const sheet = $('mute-sheet');
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.close('cancel');
  });
  sheet.addEventListener('close', () => {
    if (sheet.returnValue !== 'mute') return;
    const checked = [...sheet.querySelectorAll('input[type="checkbox"]:checked')];
    const typed = $('mute-custom')
      .value.split(/[,\u3001]/) // a comma, or the Japanese one
      .map((s) => s.trim())
      .filter(Boolean);
    onMute({
      domains: checked.filter((i) => i.name === 'domain').map((i) => i.value),
      keywords: [...checked.filter((i) => i.name === 'keyword').map((i) => i.value), ...typed],
    });
  });
}
