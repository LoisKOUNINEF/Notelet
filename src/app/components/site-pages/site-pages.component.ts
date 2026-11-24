import {
  Component,
  html,
  // @ts-ignore : function used in HTML template
  raw,
} from '../../../core/index.js';
import { applyRequestedFocus, byData, renderKeepingFocus, requestFocus } from '../../lib/focus.js';
import { plural } from '../../lib/plural.js';
import { SITE_PAGE_TOGGLE, SitePageRowComponent, type ISitePageEntry, type ISitePageRowOptions } from '../site-page-row/site-page-row.component.js';

export interface ISitePagesConfig {
  // null while they're being listed (the first time for this site): a spinner shows.
  pages: ISitePage[] | null;
  // The active tab's keys: its page is shown, but not as a link; its site is where "Move all" sends.
  keys: IScopeKeys;
  // The kind tab shown: only the pages with notes, or with to-dos, are listed.
  kind: ScopeContentKind;
}

interface ISitePagesView {
  loading: boolean;
  count: number;
  listLabel: string;
  expanded: boolean;
}

// @ts-ignore : variable(s) used in HTML template
const templateFn = ({ loading, count, listLabel, expanded }: ISitePagesView) => html`__TEMPLATE_PLACEHOLDER__`;

const TOGGLE = '.site-pages__toggle';

/**
 * "Pages on this site (n)": a collapsible list of the site's pages that have notes (the
 * Notes tab) or to-dos (the To-dos tab), each opening in the active tab (the panel then follows
 * it), with its own "Move all to this site" and "Delete" (see SitePageRowComponent). The sidebar
 * keeps it across renders and hands it new pages through update(); open or closed stays as the
 * user left it.
 */
export class SitePagesComponent extends Component<HTMLElement, ISitePagesView> {
  private _pages: ISitePage[] | null;
  private _keys: IScopeKeys;
  private _kind: ScopeContentKind;
  private _entries: ISitePageEntry[] = [];
  // The same object while the kind and keys stay: the rows are kept (see createCatalogComponents).
  private _rowOptions: ISitePageRowOptions;
  private _expanded = false;

  constructor(mountTarget: HTMLElement, { pages, keys, kind }: ISitePagesConfig) {
    super({ templateFn, mountTarget, config: { loading: true, count: 0, listLabel: '', expanded: false } });
    this._pages = pages;
    this._keys = keys;
    this._kind = kind;
    this._rowOptions = rowOptions(kind, keys);
    this.config = this.viewOf();
  }

  private viewOf(): ISitePagesView {
    this._entries = entriesOf(this._pages ?? [], this._keys.page, this._kind);
    return {
      loading: this._pages === null,
      count: this._entries.length,
      listLabel: `Pages of this site with ${this._kind === 'notes' ? 'notes' : 'to-dos'}`,
      expanded: this._expanded,
    };
  }

  public update(pages: ISitePage[] | null, keys: IScopeKeys, kind: ScopeContentKind): void {
    if (pages === this._pages && keys === this._keys && kind === this._kind) return;
    if (keys !== this._keys || kind !== this._kind) this._rowOptions = rowOptions(kind, keys);
    this._pages = pages;
    this._keys = keys;
    this._kind = kind;
    this.refresh();
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return this.createCatalogComponents({
      items: this._entries,
      selector: 'site-page-rows',
      elementName: 'site-page-row',
      elementTag: 'li',
      component: SitePageRowComponent,
      props: this._rowOptions,
      keepBy: (entry: ISitePageEntry) => entry.key,
    });
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    applyRequestedFocus(this.element);
  }

  // @ts-ignore : function used in HTML template
  private _toggle(): void {
    this._expanded = !this._expanded;
    requestFocus(TOGGLE);
    this.refresh();
  }

  // Rebuilt on every render: whatever had the focus gets it back (a page link or a path's arrow,
  // or the toggle if that row is gone), unless the action asked otherwise.
  private refresh(): void {
    const active = document.activeElement as HTMLElement | null;
    const url = active?.dataset?.url;
    const pageKey = active?.matches(SITE_PAGE_TOGGLE) ? active.closest<HTMLElement>('.site-page-row')?.dataset.pageKey : undefined;
    const page = url ? [`.site-page-row__page${byData('url', url)}`] : [];
    const arrow = pageKey ? [`.site-page-row${byData('page-key', pageKey)} ${SITE_PAGE_TOGGLE}`] : [];
    renderKeepingFocus(this.element, [...page, ...arrow, TOGGLE], () => {
      this.config = this.viewOf();
      this.render();
    });
  }
}

function rowOptions(kind: ScopeContentKind, keys: IScopeKeys): ISitePageRowOptions {
  // Once no row is left, the list goes too: the kind tab takes the focus.
  return { kind, keys, lastFocus: [`#kind-tab-${kind}`] };
}

// The pages holding the kind, with what they hold of it.
function entriesOf(pages: ISitePage[], currentPage: string, kind: ScopeContentKind): ISitePageEntry[] {
  return pages.flatMap(({ key, label, notes, todos, openTodos }) => {
    const count = kind === 'notes' ? notes : todos;
    if (count === 0) return [];
    return [{ key, label, count, countText: countText(kind, notes, todos, openTodos), current: key === currentPage }];
  });
}

// Its notes; or its open to-dos, like the scope tabs count them, or its done ones if that's all.
function countText(kind: ScopeContentKind, notes: number, todos: number, openTodos: number): string {
  if (kind === 'notes') return plural(notes, 'note');
  return openTodos > 0 ? plural(openTodos, 'to-do') : `${plural(todos, 'to-do')} done`;
}
