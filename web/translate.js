// Titles in another language get a second line in the page's language, translated on the device by the
// browser's built-in Translator (desktop Chrome and Edge). Nothing is sent anywhere and nothing is paid for;
// browsers without it show the titles as they are.

/** source language -> Promise of a translator, or null when the browser can't translate that pair */
const translators = new Map();
/** `${from}>${to}\n${title}` -> translated title, or null when translating failed */
const translated = new Map();
const pending = new Set();

const keyOf = (story, target) => `${story.lang}>${target}\n${story.title}`;

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
 * The title in `target`, if it is already translated. Otherwise starts translating it (one request per title)
 * and calls `onReady` once there is a translation to show.
 */
export function translationOf(story, target, onReady) {
  if (!story.lang || story.lang === target || !globalThis.Translator) return null;
  const key = keyOf(story, target);
  if (translated.has(key)) return translated.get(key);
  if (!pending.has(key)) {
    pending.add(key);
    translatorFor(story.lang, target)
      .then((translator) => translator?.translate(story.title) ?? null)
      .catch(() => null)
      .then((text) => {
        pending.delete(key);
        const useful = text && text.trim() !== story.title.trim() ? text.trim() : null;
        translated.set(key, useful);
        if (useful) onReady();
      });
  }
  return null;
}
