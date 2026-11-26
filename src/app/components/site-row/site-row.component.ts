import { Component, html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { announce } from '../../lib/announce.js';
import { editOnClick } from '../../lib/card-click.js';
import { countList, plural } from '../../lib/plural.js';
import {
  // @ts-ignore : function used in HTML template
  formatDateTime,
  formatTimeAgo,
} from '../../lib/pipes.js';
import { activeTabService } from '../../services/active-tab/active-tab.service.js';
import { chromeApiService } from '../../services/chrome-api/chrome-api.service.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService, type IMovedSite, type RemovedItems } from '../../services/scope-store/scope-store.service.js';
import { ItemMenuComponent, type IMenuAction } from '../item-menu/item-menu.component.js';

// What the site manager passes to each row, besides the site (see createCatalogComponents).
export interface ISiteRowOptions {
  // The active tab's site, marked as "current" for orientation.
  currentSite: string | null;
  // Where the focus goes once the last row is deleted.
  lastFocus: string;
}

interface ISiteRowView {
  site: ISiteSummary;
  counts: string;
  current: boolean;
  // Its home page, opened by a click on it or "Open in a new tab".
  url: string;
}

type SiteMenuAction = 'open-tab' | 'move-site' | 'move-page' | 'delete-notes' | 'delete-todos';

// @ts-ignore : variable(s) used in HTML template
const templateFn = ({ site, counts, current, url }: ISiteRowView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One site in "Manage by site": its domain, how many notes and to-dos it holds (its pages'
 * included), when they were last edited, a "⋯" menu ("Open in a new tab", "Move all to this
 * site (n)", "Move all to this page (n)", "Delete all notes (n)", "Delete all to-dos (n)", each disabled
 * when there's nothing to do) and a "Delete all" for everything. Moves go to the active tab's
 * site or page, and are undoable; deletes are asked first and undoable. Another site's card opens its home page in
 * the active tab, like a page in "Pages on this site".
 */
export class SiteRowComponent extends Component<HTMLElement, ISiteRowView> {
  private _site: ISiteSummary;
  private readonly _lastFocus: string;
  // Another site than the active tab's, while that tab can have notes: it can be moved there.
  private readonly _canMove: boolean;

  constructor(mountTarget: HTMLElement, config: ISiteSummary & { index: number }, options: ISiteRowOptions) {
    const { index: _index, ...site } = config;
    const current = site.site === options.currentSite;
    super({
      templateFn,
      mountTarget,
      props: { className: 'site-row' },
      config: { site, counts: countText(site), current, url: homeOf(site.site) },
    });
    this._site = site;
    this._lastFocus = options.lastFocus;
    this._canMove = !current && options.currentSite !== null;
    // Only its own <time> changes as minutes pass.
    this.listen('minute-tick', () => {
      const time = this.element.querySelector('.site-row__meta time');
      if (time) time.textContent = formatTimeAgo(this._site.lastEdited);
    });
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return [{
      selector: 'item-menu',
      factory: (el) => new ItemMenuComponent<SiteMenuAction>(el, {
        id: `site-row-${this._site.site}`,
        name: this._site.site,
        actions: this.menuActions(),
        onAction: (action) => this.onMenuAction(action),
      }),
    }];
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    if (!this.config.current) this.eventListeners.push(editOnClick(this.element, () => void this._open()));
  }

  // The current site is already open, and is where the others move to (none when the tab can't
  // have notes); there's nothing to delete of a kind it has none of.
  private menuActions(): IMenuAction<SiteMenuAction>[] {
    const { notes, todos } = this._site;
    const all = notes + todos;
    return [
      { value: 'open-tab', label: 'Open in a new tab', disabled: this.config.current },
      { value: 'move-site', label: `Move all to this site (${all})`, disabled: !this._canMove },
      { value: 'move-page', label: `Move all to this page (${all})`, disabled: !this._canMove },
      { value: 'delete-notes', label: `Delete all notes (${notes})`, disabled: notes === 0 },
      { value: 'delete-todos', label: `Delete all to-dos (${todos})`, disabled: todos === 0 },
    ];
  }

  private onMenuAction(action: SiteMenuAction): void {
    switch (action) {
      case 'open-tab': void this.openInNewTab(); break;
      case 'move-site': void this.moveTo('site'); break;
      case 'move-page': void this.moveTo('page'); break;
      case 'delete-notes': void this.deleteKind('notes'); break;
      case 'delete-todos': void this.deleteKind('todos'); break;
    }
  }

  // @ts-ignore : function used in HTML template
  private async _open(): Promise<void> {
    await runAction('Couldn\'t open the site.', () => chromeApiService.openInActiveTab(this.config.url));
  }

  // Behind the current tab: nothing else shows it opened, so screen readers are told.
  private async openInNewTab(): Promise<void> {
    const opened = await runAction('Couldn\'t open the site.', async () => {
      await chromeApiService.openInBackgroundTab(this.config.url);
      return true;
    });
    if (opened) announce(`${this._site.site} opened in a new tab.`);
  }

  // Everything on the site, its pages' included, to the active tab's site or page. Read when picked:
  // the rows aren't rebuilt as the tab moves between pages of its site.
  private async moveTo(scope: NoteScope): Promise<void> {
    const keys = activeTabService.keys;
    if (!keys || keys.site === this._site.site) return;
    const { site } = this._site;
    const moved = await runAction('Couldn\'t move this site\'s notes.', () => scopeStoreService.moveSite(site, scope, keys[scope]), {
      focus: this.focusAfterLeaving(),
    });
    if (!moved) return;
    const counts = movedCount(moved);
    if (!counts) return;
    notifierService.undoable(
      `${site}: ${counts} moved to this ${scope}.`,
      () => scopeStoreService.moveSiteBack(moved),
      'Couldn\'t move them back.',
      'success',
    );
  }

  // @ts-ignore : function used in HTML template
  private async _delete(): Promise<void> {
    const { site } = this._site;
    const counts = countText(this._site);
    const confirmed = await confirmService.ask({
      title: `Delete everything on ${site}?`,
      message: `${counts}, on the site and its pages.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    const removed = await runAction('Couldn\'t delete this site\'s notes.', () => scopeStoreService.removeSite(site), {
      focus: this.focusAfterLeaving(),
    });
    if (removed) notifierService.undoable(`${site}: ${counts} deleted.`, () => scopeStoreService.restoreRemoved(removed), 'Couldn\'t restore them.');
  }

  // "Delete all notes (n)" / "Delete all to-dos (n)": that kind only, the site's and its pages'.
  private async deleteKind(kind: ScopeContentKind): Promise<void> {
    const { site } = this._site;
    const word = kind === 'notes' ? 'note' : 'to-do';
    const what = plural(this._site[kind], word);
    const confirmed = await confirmService.ask({
      title: `Delete all ${word}s on ${site}?`,
      message: `${what}, on the site and its pages.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    // The other kind left, the row stays (rebuilt with its new counts): back on its "⋯".
    const others = this._site[kind === 'notes' ? 'todos' : 'notes'] > 0;
    const removed = await runAction(`Couldn't delete this site's ${word}s.`, () => scopeStoreService.removeSiteKind(site, kind), {
      focus: others ? [`[id="site-row-${site}-more"]`, ...this.focusAfterLeaving()] : this.focusAfterLeaving(),
    });
    if (removed) {
      notifierService.undoable(`${site}: ${plural(removedCount(removed), word)} deleted.`, () => scopeStoreService.restoreRemoved(removed), 'Couldn\'t restore them.');
    }
  }

  // Once this row is gone, the next one takes its place (else the previous one, else the order).
  private focusAfterLeaving(): string[] {
    const index = Number(this.element.closest<HTMLElement>('[data-index]')?.dataset.index ?? 0);
    return [`[data-index="${index}"] .site-row__delete`, `[data-index="${index - 1}"] .site-row__delete`, this._lastFocus];
  }
}

function countText({ notes, todos }: ISiteSummary): string {
  return countList([[notes, 'note'], [todos, 'to-do']]);
}

// A site key is a host without "www." or port: its home page, over https (sites redirect from there).
function homeOf(site: string): string {
  return `https://${site}/`;
}

// "2 notes and 1 to-do"; '' when nothing moved.
function movedCount({ notes, todos }: IMovedSite): string {
  return countList([[notes.moved.length, 'note'], [todos.moved.length, 'to-do']]);
}

function removedCount(removed: RemovedItems): number {
  return Object.values(removed).reduce((total, items) => total + items.length, 0);
}
