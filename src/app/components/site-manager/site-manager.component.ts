import { Component, html, raw } from '../../../core/index.js';
import { errorMessage } from '../../lib/errors.js';
import { applyRequestedFocus } from '../../lib/focus.js';
import { activeTabService } from '../../services/active-tab/active-tab.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { SiteRowComponent, type ISiteRowOptions } from '../site-row/site-row.component.js';

export interface ISiteManagerOptions {
  // "Back to settings".
  onBack: () => void;
}

interface ISiteManagerView {
  loading: boolean;
  empty: boolean;
  orders: { value: SitesOrder; label: string; selected: boolean }[];
}

const templateFn = ({ loading, empty, orders }: ISiteManagerView) => html`__TEMPLATE_PLACEHOLDER__`;

const ORDERS: { value: SitesOrder; label: string }[] = [
  { value: 'recent', label: 'Recent → old' },
  { value: 'oldest', label: 'Old → recent' },
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
];

const COMPARE: Record<SitesOrder, (a: ISiteSummary, b: ISiteSummary) => number> = {
  recent: (a, b) => b.lastEdited - a.lastEdited || a.site.localeCompare(b.site),
  oldest: (a, b) => a.lastEdited - b.lastEdited || a.site.localeCompare(b.site),
  az: (a, b) => a.site.localeCompare(b.site),
  za: (a, b) => b.site.localeCompare(a.site),
};

// Controls rebuilt on every render (the order changing, the list reloading) whose focus is kept.
const FOCUSABLE = ['.site-manager__select', '.site-manager__back'];

/**
 * Settings' "Manage by site" page: every site with notes or to-dos (its pages' included), in the
 * order picked (a setting), each with a "Delete" for all of it. Follows every change, here or in
 * another window; the rows are kept across those reloads.
 */
export class SiteManagerComponent extends Component<HTMLElement, ISiteManagerView> {
  private _sites: ISiteSummary[] | null = null;
  private _order: SitesOrder = settingsService.sitesOrder;
  private _onBack: () => void;
  private readonly _rowOptions: ISiteRowOptions = { currentSite: activeTabService.keys?.site ?? null };
  private _loadId = 0;
  private _destroyed = false;

  constructor(mountTarget: HTMLElement, { onBack }: ISiteManagerOptions) {
    super({ templateFn, mountTarget, config: { loading: true, empty: false, orders: [] } });
    this._onBack = onBack;
    this.config = this.view();
    this.listen('scope-content-changed', () => void this.load());
    this.listen('storage-area-changed', () => void this.load());
    void this.load();
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return this.createCatalogComponents({
      items: [...(this._sites ?? [])].sort(COMPARE[this._order]),
      selector: 'sites',
      elementName: 'site',
      elementTag: 'li',
      component: SiteRowComponent,
      props: this._rowOptions,
      keepBy: (site: ISiteSummary) => site.site,
    });
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    applyRequestedFocus(this.element);
  }

  protected override onBeforeDestroy(): void {
    this._destroyed = true;
    super.onBeforeDestroy();
  }

  private async load(): Promise<void> {
    const loadId = ++this._loadId;
    let sites: ISiteSummary[];
    try {
      sites = await scopeStoreService.listSites();
    } catch (error) {
      if (loadId !== this._loadId) return;
      notifierService.error(`Couldn't list your sites. ${errorMessage(error)}`);
      // What was shown stays, or an empty list rather than a spinner left turning.
      sites = this._sites ?? [];
    }
    if (loadId !== this._loadId) return;
    this._sites = sites;
    this.refresh();
  }

  private async _setOrder(select: HTMLSelectElement): Promise<void> {
    const order = ORDERS.find(({ value }) => value === select.value)?.value;
    if (!order || order === this._order) return;
    this._order = order;
    this.refresh();
    try {
      await settingsService.setSitesOrder(order);
    } catch (error) {
      notifierService.error(`Couldn't save that setting. ${errorMessage(error)}`);
    }
  }

  private _back(): void {
    this._onBack();
  }

  private view(): ISiteManagerView {
    return {
      loading: this._sites === null,
      empty: this._sites?.length === 0,
      orders: ORDERS.map(({ value, label }) => ({ value, label, selected: value === this._order })),
    };
  }

  // Re-renders, keeping the focus on the order or "Back" if one had it (the rows keep theirs).
  // A destroyed page would rebuild rows nothing would then destroy.
  private refresh(): void {
    if (this._destroyed) return;
    const active = document.activeElement;
    const focused = active instanceof HTMLElement ? FOCUSABLE.find((selector) => active.matches(selector)) : undefined;
    this.config = this.view();
    this.render();
    if (focused) this.element.querySelector<HTMLElement>(focused)?.focus();
  }
}

