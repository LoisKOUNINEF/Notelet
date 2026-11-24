import { Component, html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { announce } from '../../lib/announce.js';
import { byData } from '../../lib/focus.js';
import { sentence } from '../../lib/labels.js';
import { plural } from '../../lib/plural.js';
import { chromeApiService } from '../../services/chrome-api/chrome-api.service.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { ItemMenuComponent, type IMenuAction } from '../item-menu/item-menu.component.js';

// A page as "Pages on this site" lists it: for the tab's kind only.
export interface ISitePageEntry {
  // Its page key, which is also a URL to open it.
  key: string;
  label: string;
  // How many notes, or to-dos (done ones included): what its actions move or delete.
  count: number;
  countText: string;
  // The active tab's page: shown, but not as a link.
  current: boolean;
}

// What the list passes to each row, besides the page (see createCatalogComponents).
export interface ISitePageRowOptions {
  kind: ScopeContentKind;
  // The active tab's keys: "Move all to this site" sends them to `keys.site`.
  keys: IScopeKeys;
  // Where the focus goes once no row is left.
  lastFocus: string[];
}

interface ISitePageRowView {
  page: ISitePageEntry;
}

// @ts-ignore : variable(s) used in HTML template
const templateFn = ({ page }: ISitePageRowView) => html`__TEMPLATE_PLACEHOLDER__`;

type RowMenuAction = 'open-tab' | 'move';

// Its Delete: where the focus goes once a row has left.
const DELETE = '.site-page-row__delete';

/**
 * One page in "Pages on this site": its path and how many notes or to-dos it holds (a click
 * opens it in the active tab), a "⋯" menu with "Open in a new tab" (not for the current page) and
 * "Move all notes (or to-dos) to this site", and a "Delete" for all of them (asked first). Moving
 * and deleting are undoable.
 */
export class SitePageRowComponent extends Component<HTMLElement, ISitePageRowView> {
  private readonly _page: ISitePageEntry;
  private readonly _options: ISitePageRowOptions;

  constructor(mountTarget: HTMLElement, config: ISitePageEntry & { index: number }, options: ISitePageRowOptions) {
    const { index: _index, ...page } = config;
    super({ templateFn, mountTarget, props: { className: 'site-page-row' }, config: { page } });
    // Lets a row leaving the list hand the focus to this one (see focusAfterLeaving).
    this.element.dataset.pageKey = page.key;
    this._page = page;
    this._options = options;
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return [{
      selector: 'item-menu',
      factory: (el) => new ItemMenuComponent<RowMenuAction>(el, {
        id: `site-page-${this._page.key}`,
        name: this._page.label,
        actions: this.menuActions(),
        onAction: (action) => void (action === 'open-tab' ? this.openInNewTab() : this.moveAll()),
      }),
    }];
  }

  // The current page is already open: no "Open in a new tab" for it.
  private menuActions(): IMenuAction<RowMenuAction>[] {
    return [
      ...(this._page.current ? [] : [{ value: 'open-tab' as const, label: 'Open in a new tab' }]),
      { value: 'move', label: `Move all ${word(this._options.kind)}s to this site` },
    ];
  }

  // Behind the current tab: nothing else shows it opened, so screen readers are told.
  private async openInNewTab(): Promise<void> {
    const { key, label } = this._page;
    const opened = await runAction('Couldn\'t open the page.', async () => {
      await chromeApiService.openInBackgroundTab(key);
      return true;
    });
    if (opened) announce(`${label} opened in a new tab.`);
  }

  // @ts-ignore : function used in HTML template
  private async _open(url: string): Promise<void> {
    await runAction('Couldn\'t open the page.', () => chromeApiService.openInActiveTab(url));
  }

  private async moveAll(): Promise<void> {
    const { kind, keys } = this._options;
    const what = this.what();
    const result = await runAction(`Couldn't move ${what} to this site.`, () => scopeStoreService.moveAll(kind, this._page.key, keys), {
      focus: this.focusAfterLeaving(),
    });
    if (!result || result.moved.length === 0) return;
    const { moved, originals } = result;
    notifierService.undoable(
      `${sentence(plural(moved.length, word(kind)))} moved to this site from ${this._page.label}.`,
      () => scopeStoreService.moveManyBack(kind, moved, originals),
      'Couldn\'t move them back.',
      'success',
    );
  }

  // @ts-ignore : function used in HTML template
  private async _delete(): Promise<void> {
    const { kind } = this._options;
    const what = this.what();
    const confirmed = await confirmService.ask({
      title: `Delete ${what} on ${this._page.label}?`,
      message: kind === 'todos' ? `Every to-do on ${this._page.key}, done ones included.` : `Every note on ${this._page.key}.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    const removed = await runAction(`Couldn't delete ${what}.`, () => scopeStoreService.removeAll(kind, 'page', this._page.key), {
      focus: this.focusAfterLeaving(),
    });
    if (!removed || removed.length === 0) return;
    notifierService.undoable(
      `${this._page.label}: ${plural(removed.length, word(kind))} deleted.`,
      () => scopeStoreService.restoreMany(kind, removed),
      'Couldn\'t restore them.',
    );
  }

  // "3 notes", "1 to-do": all of them, done ones included.
  private what(): string {
    return plural(this._page.count, word(this._options.kind));
  }

  // Once this row leaves the list, the next one takes its place (else the previous one, else what
  // the list says). Found by their page: the focus can be applied before the list re-renders (by
  // the panel, as its own lists reload), while this row is still there.
  private focusAfterLeaving(): string[] {
    const wrapper = this.element.parentElement;
    const neighbours = [wrapper?.nextElementSibling, wrapper?.previousElementSibling]
      .map((li) => li?.querySelector<HTMLElement>('.site-page-row')?.dataset.pageKey)
      .filter((key): key is string => !!key);
    return [...neighbours.map((key) => `.site-page-row${byData('page-key', key)} ${DELETE}`), ...this._options.lastFocus];
  }
}

function word(kind: ScopeContentKind): string {
  return kind === 'notes' ? 'note' : 'to-do';
}
