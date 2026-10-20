import { Component, html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { countList } from '../../lib/plural.js';
import { formatDateTime, formatTimeAgo } from '../../lib/pipes.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';

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
}

const templateFn = ({ site, counts, current }: ISiteRowView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * One site in "Manage by site": its domain, how many notes and to-dos it holds (its pages'
 * included), when they were last edited, and a "Delete" for all of them (asked first, undoable).
 */
export class SiteRowComponent extends Component<HTMLElement, ISiteRowView> {
  private _site: ISiteSummary;
  private readonly _lastFocus: string;

  constructor(mountTarget: HTMLElement, config: ISiteSummary & { index: number }, options: ISiteRowOptions) {
    const { index: _index, ...site } = config;
    super({
      templateFn,
      mountTarget,
      props: { className: 'site-row' },
      config: { site, counts: countText(site), current: site.site === options.currentSite },
    });
    this._site = site;
    this._lastFocus = options.lastFocus;
    // Only its own <time> changes as minutes pass.
    this.listen('minute-tick', () => {
      const time = this.element.querySelector('.site-row__meta time');
      if (time) time.textContent = formatTimeAgo(this._site.lastEdited);
    });
  }

  private async _delete(): Promise<void> {
    const { site } = this._site;
    const counts = countText(this._site);
    const confirmed = await confirmService.ask({
      title: `Delete everything on ${site}?`,
      message: `${counts}, on the site and its pages.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    // Once this row is gone, the next one takes its place (else the previous one, else the order).
    const index = Number(this.element.closest<HTMLElement>('[data-index]')?.dataset.index ?? 0);
    const removed = await runAction('Couldn\'t delete this site\'s notes.', () => scopeStoreService.removeSite(site), {
      focus: [`[data-index="${index}"] .site-row__delete`, `[data-index="${index - 1}"] .site-row__delete`, this._lastFocus],
    });
    if (removed) notifierService.undoable(`${site}: ${counts} deleted.`, () => scopeStoreService.restoreRemoved(removed), 'Couldn\'t restore them.');
  }
}

function countText({ notes, todos }: ISiteSummary): string {
  return countList([[notes, 'note'], [todos, 'to-do']]);
}
