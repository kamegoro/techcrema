import { $ } from './dom.js';

let hideTimer = null;

/** A short message at the bottom, with an optional action such as Undo */
export function toast(text, action) {
  const box = $('toast');
  const button = $('toast-action');
  $('toast-text').textContent = text;
  button.hidden = !action;
  button.onclick = null;
  if (action) {
    button.textContent = action.label;
    button.onclick = () => {
      box.hidden = true;
      action.run();
    };
  }
  box.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => (box.hidden = true), action ? 6000 : 2800);
}

export const offeringAction = () => !$('toast').hidden && !$('toast-action').hidden;
