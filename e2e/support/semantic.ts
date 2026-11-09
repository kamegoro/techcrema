/** Find elements by ARIA role and accessible name only, the way a screen reader does. No CSS, no test ids. */
import type { Locator, Page } from '@playwright/test';

type Scope = Page | Locator;

export const heading = (scope: Scope, name: string | RegExp, level?: number) =>
  scope.getByRole('heading', { name, exact: typeof name === 'string', level });
export const region = (scope: Scope, name: string) => scope.getByRole('region', { name, exact: true });
export const article = (scope: Scope, name: string) => scope.getByRole('article', { name, exact: true });
export const button = (scope: Scope, name: string | RegExp) =>
  scope.getByRole('button', { name, exact: typeof name === 'string' });
export const link = (scope: Scope, name: string | RegExp) =>
  scope.getByRole('link', { name, exact: typeof name === 'string' });
export const navigation = (scope: Scope, name: string) => scope.getByRole('navigation', { name, exact: true });
export const dialog = (scope: Scope) => scope.getByRole('dialog');
export const checkbox = (scope: Scope, name: string) => scope.getByRole('checkbox', { name, exact: true });
export const textbox = (scope: Scope, name: string) => scope.getByRole('textbox', { name, exact: true });
export const status = (scope: Scope) => scope.getByRole('status');
export const paragraph = (scope: Scope, text: string | RegExp) =>
  scope.getByRole('paragraph').filter({ hasText: text });
