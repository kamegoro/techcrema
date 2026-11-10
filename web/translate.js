// Titles and comments in another language get a version in the page's language, translated on the device by the
// browser's built-in Translator (desktop Chrome and Edge). Nothing is sent anywhere and nothing is paid for;
// browsers without it show them as they are.

/** source language -> Promise of a translator, or null when the browser can't translate that pair */
const translators = new Map();
/** `${from}>${to}\n${text}` -> translated text, or null when translating failed */
const translated = new Map();
const pending = new Set();

const keyOf = ({ lang, text }, target) => `${lang}>${target}\n${text}`;

/** Downloading a language pack needs a tap or key press first (the browser asks for one) */
function nextGesture() {
  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener('pointerdown', done, true);
      document.removeEventListener('keydown', done, true);
      resolve();
    };
    document.addEventListener('pointerdown', done, true);
    document.addEventListener('keydown', done, true);
  });
}

async function createTranslator(sourceLanguage, targetLanguage) {
  const api = globalThis.Translator;
  if (!api) return null;
  const options = { sourceLanguage, targetLanguage };
  const availability = await api.availability(options);
  if (availability === 'unavailable') return null;
  if (availability !== 'available') await nextGesture();
  return api.create(options);
}

function translatorFor(source, target) {
  const id = `${source}>${target}`;
  if (!translators.has(id))
    translators.set(
      id,
      createTranslator(source, target).catch(() => null),
    );
  return translators.get(id);
}

/**
 * `text` (written in `lang`) in `target`, if it is already translated. Otherwise starts translating it
 * (once per text) and calls `onReady` when there is a translation to show.
 */
export function translationOf({ lang, text }, target, onReady) {
  if (!lang || lang === target || !globalThis.Translator) return null;
  const key = keyOf({ lang, text }, target);
  if (translated.has(key)) return translated.get(key);
  if (!pending.has(key)) {
    pending.add(key);
    translatorFor(lang, target)
      .then((translator) => translator?.translate(text) ?? null)
      .catch(() => null)
      .then((result) => {
        pending.delete(key);
        const useful = result && result.trim() !== text.trim() ? result.trim() : null;
        translated.set(key, useful);
        if (useful) onReady();
      });
  }
  return null;
}
