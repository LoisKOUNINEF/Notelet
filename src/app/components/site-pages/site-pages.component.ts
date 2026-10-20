import { Component, html, raw } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { applyRequestedFocus, byData, renderKeepingFocus, requestFocus } from '../../lib/focus.js';
import { countList, plural } from '../../lib/plural.js';
import { chromeApiService } from '../../services/chrome-api/chrome-api.service.js';

export interface ISitePagesConfig {
  // null while they're being listed (the first time for this site): a spinner shows.
  pages: ISitePage[] | null;
  // The active tab's page key: shown, but not as a link.
  currentPage: string;
}

interface ISitePageEntry extends ISitePage {
  current: boolean;
  countText: string;
}

interface ISitePagesView {
  loading: boolean;
  pages: ISitePageEntry[];
  expanded: boolean;
}

const templateFn = ({ loading, pages, expanded }: ISitePagesView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * "Pages on this site (n)": a collapsible list of the site's pages that have notes or to-dos,
 * each opening in the active tab (the panel then follows it). The sidebar keeps it across
 * renders and hands it new pages through update(); open or closed stays as the user left it.
 */
export class SitePagesComponent extends Component<HTMLElement, ISitePagesView> {
  private _pages: ISitePage[] | null;
  private _currentPage: string;
  private _expanded = false;

  constructor(mountTarget: HTMLElement, { pages, currentPage }: ISitePagesConfig) {
    super({ templateFn, mountTarget, config: SitePagesComponent.viewOf(pages, currentPage, false) });
    this._pages = pages;
    this._currentPage = currentPage;
  }

  private static viewOf(pages: ISitePage[] | null, currentPage: string, expanded: boolean): ISitePagesView {
    return {
      loading: pages === null,
      pages: (pages ?? []).map((page) => ({ ...page, current: page.key === currentPage, countText: countText(page) })),
      expanded,
    };
  }

  public update(pages: ISitePage[] | null, currentPage: string): void {
    if (pages === this._pages && currentPage === this._currentPage) return;
    this._pages = pages;
    this._currentPage = currentPage;
    this.refresh();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    applyRequestedFocus(this.element);
  }

  private _toggle(): void {
    this._expanded = !this._expanded;
    requestFocus('.site-pages__toggle');
    this.refresh();
  }

  private async _open(url: string): Promise<void> {
    await runAction('Couldn\'t open the page.', () => chromeApiService.openInActiveTab(url));
  }

  // Rebuilt on every render: whatever had the focus gets it back (a page link, or the toggle if
  // that link is gone), unless the action asked otherwise.
  private refresh(): void {
    const url = (document.activeElement as HTMLElement | null)?.dataset?.url;
    const page = url ? [`.site-pages__page${byData('url', url)}`] : [];
    renderKeepingFocus(this.element, [...page, '.site-pages__toggle'], () => {
      this.config = SitePagesComponent.viewOf(this._pages, this._currentPage, this._expanded);
      this.render();
    });
  }
}

// What a page holds: its notes and open to-dos, like the scope tabs count them, or its done ones if that's all.
function countText({ notes, todos, openTodos }: ISitePage): string {
  const done = openTodos === 0 && todos > 0 ? `${plural(todos, 'to-do')} done` : '';
  return [countList([[notes, 'note'], [openTodos, 'to-do']], ', '), done].filter(Boolean).join(', ');
}
