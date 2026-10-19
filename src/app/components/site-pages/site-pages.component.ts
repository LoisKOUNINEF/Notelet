import { Component, html, raw } from '../../../core/index.js';
import { errorMessage } from '../../lib/errors.js';
import { applyRequestedFocus, byData, requestFocus } from '../../lib/focus.js';
import { chromeApiService } from '../../services/chrome-api/chrome-api.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';

export interface ISitePagesConfig {
  pages: ISitePage[];
  // The active tab's page key: shown, but not as a link.
  currentPage: string;
}

interface ISitePageEntry extends ISitePage {
  current: boolean;
  countText: string;
}

interface ISitePagesView {
  pages: ISitePageEntry[];
  expanded: boolean;
}

const templateFn = ({ pages, expanded }: ISitePagesView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * "Pages on this site (n)": a collapsible list of the site's pages that have notes or to-dos,
 * each opening in the active tab (the panel then follows it). The sidebar keeps it across
 * renders and hands it new pages through update(); open or closed stays as the user left it.
 */
export class SitePagesComponent extends Component<HTMLElement, ISitePagesView> {
  private _pages: ISitePage[];
  private _currentPage: string;
  private _expanded = false;

  constructor(mountTarget: HTMLElement, { pages, currentPage }: ISitePagesConfig) {
    super({ templateFn, mountTarget, config: SitePagesComponent.view(pages, currentPage, false) });
    this._pages = pages;
    this._currentPage = currentPage;
  }

  private static view(pages: ISitePage[], currentPage: string, expanded: boolean): ISitePagesView {
    return {
      pages: pages.map((page) => ({ ...page, current: page.key === currentPage, countText: countText(page) })),
      expanded,
    };
  }

  public update(pages: ISitePage[], currentPage: string): void {
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
    try {
      await chromeApiService.openInActiveTab(url);
    } catch (error) {
      notifierService.error(`Couldn't open the page. ${errorMessage(error)}`);
    }
  }

  // Rebuilt on every render: whatever had the focus gets it back (unless the action asked otherwise).
  private refresh(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.element.contains(active)) {
      if (active.matches('.site-pages__toggle')) requestFocus('.site-pages__toggle');
      else if (active.dataset.url) requestFocus(`.site-pages__page${byData('url', active.dataset.url)}`, '.site-pages__toggle');
    }
    this.config = SitePagesComponent.view(this._pages, this._currentPage, this._expanded);
    this.render();
  }
}

// What a page holds: its notes and open to-dos, like the scope tabs count them, or its done ones if that's all.
function countText({ notes, todos, openTodos }: ISitePage): string {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const parts = [
    notes > 0 ? plural(notes, 'note') : '',
    openTodos > 0 ? plural(openTodos, 'to-do') : '',
    openTodos === 0 && todos > 0 ? `${plural(todos, 'to-do')} done` : '',
  ].filter(Boolean);
  return parts.join(', ');
}
