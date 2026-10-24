import { Component, html } from '../../../core/index.js';
import { runAction } from '../../lib/actions.js';
import { errorMessage } from '../../lib/errors.js';
import { applyRequestedFocus, renderKeepingFocus, requestFocus } from '../../lib/focus.js';
import { removeOverlays } from '../../lib/overlays.js';
import { isSitePageKey, storageKey } from '../../lib/scope-keys.js';
import { activeTabService } from '../../services/active-tab/active-tab.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService, type ScopedContent } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component.js';
import { PageUnavailableComponent } from '../page-unavailable/page-unavailable.component.js';
import { ScopePanelComponent, type IScopePanelState } from '../scope-panel/scope-panel.component.js';
import { MANAGE_SITES_BUTTON, SETTINGS_TITLE, SettingsPanelComponent } from '../settings-panel/settings-panel.component.js';
import { SITE_MANAGER_TITLE, SiteManagerComponent } from '../site-manager/site-manager.component.js';

// What replaces the notes when Settings is open: the settings, or their "Manage by site" page.
type SettingsPage = 'settings' | 'sites';

interface ISidebarView {
  settingsPage: SettingsPage | null;
  // The active tab can have notes.
  available: boolean;
}

const templateFn = ({ settingsPage, available }: ISidebarView) => html`__TEMPLATE_PLACEHOLDER__`;

const SETTINGS_TOGGLE = '.sidebar__settings-toggle';
const SCOPES: NoteScope[] = ['page', 'site'];
const KINDS: ScopeContentKind[] = ['notes', 'todos'];

// Before the first load (or after a failed one): empty lists rather than a panel stuck loading.
// One object, so the scope panel sees nothing changed until something did.
const EMPTY_CONTENT: ScopedContent = { page: { notes: [], todos: [] }, site: { notes: [], todos: [] } };

/**
 * The side panel's root: its header, then the active tab's notes and to-dos (see
 * ScopePanelComponent), the page that can't have any, or the settings. It follows the active tab
 * and loads what the scope panel shows, page and site together, so switching tabs never waits.
 */
export class SidebarComponent extends Component<HTMLElement, ISidebarView> {
  private _keys: IScopeKeys | null;
  private _scope: NoteScope = 'page';
  private _kind: ScopeContentKind;
  private _content: ScopedContent | null = null;
  // Another page of the same site is loading: its site-wide lists stay shown meanwhile, its page's
  // lists wait for it.
  private _pageLoading = false;
  // The site's pages that have notes or to-dos, for the "This site" tab. Listing them reads the
  // whole storage area, so only while that tab shows; null: not loaded for this site yet.
  private _sitePages: ISitePage[] | null = null;
  private _settingsPage: SettingsPage | null = null;
  private _panel: ScopePanelComponent | null = null;
  // Only the latest load's result is shown, however the requests resolve.
  private _loadId = 0;
  private _sitePagesLoadId = 0;

  constructor(mountTarget: string | HTMLElement) {
    super({ templateFn, mountTarget });
    this._keys = activeTabService.keys;
    this._kind = settingsService.contentKind;
    this.config = this.view();

    this.listen('active-scope-changed', ({ keys }) => {
      const site = keys && keys.site === this._keys?.site ? this._content?.site : undefined;
      const sameSite = site !== undefined;
      this._keys = keys;
      // On the same site, the "This site" lists and pages are kept as they are (their DOM, scroll
      // and a reorder in progress with them): only the page's content is new.
      this._content = site ? { page: EMPTY_CONTENT.page, site } : null;
      this._pageLoading = sameSite;
      this.refresh();
      void this.load();
      if (sameSite) return;
      this._sitePages = null;
      void this.loadSitePages();
    });
    this.listen('scope-content-changed', ({ keys }) => this.reload(keys));
    this.listen('storage-area-changed', () => this.reload(null));
    // The To-dos / Notes tab picked in another window.
    this.listen('settings-changed', () => {
      if (settingsService.contentKind === this._kind) return;
      this._kind = settingsService.contentKind;
      this.refresh();
    });
    void this.load();
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    return [
      {
        selector: 'settings-panel',
        factory: (el) => new SettingsPanelComponent(el, { onManageSites: () => this.openSettings('sites', SITE_MANAGER_TITLE) }),
        keep: 'settings',
      },
      {
        selector: 'site-manager',
        factory: (el) => new SiteManagerComponent(el, { onBack: () => this.openSettings('settings', MANAGE_SITES_BUTTON) }),
        keep: 'sites',
      },
      { selector: 'page-unavailable', factory: (el) => new PageUnavailableComponent(el), keep: 'unavailable' },
      // Kept while shown: it re-renders itself when what it shows changed (see onAfterRender).
      {
        selector: 'scope-panel',
        // Only rendered when the active tab can have notes (see the template): its state is there.
        factory: (el) => (this._panel = new ScopePanelComponent(el, this.panelState()!, {
          onSelectScope: (scope) => this.selectScope(scope),
          onSelectKind: (kind) => void this.selectKind(kind),
        })),
        keep: 'scope',
      },
      // Asks before "Delete all" (see confirmService), from the lists and the settings alike.
      { selector: 'confirm-dialog', factory: (el) => new ConfirmDialogComponent(el), keep: 'confirm' },
    ];
  }

  // The Settings toggle's tooltip is an overlay on <body> (see lib/overlays.ts).
  protected override onBeforeRender(): void {
    removeOverlays(this.element, '.sidebar__overlays');
    super.onBeforeRender();
  }

  protected override onBeforeDestroy(): void {
    removeOverlays(this.element, '.sidebar__overlays');
    super.onBeforeDestroy();
  }

  // A kept scope panel still shows what it had: hand it the current state, then place the focus.
  protected override onAfterRender(): void {
    super.onAfterRender();
    const state = this.panelState();
    if (state && this._panel && this.element.contains(this._panel.getElement())) this._panel.update(state);
    applyRequestedFocus(this.element);
  }

  private selectScope(scope: NoteScope): void {
    this._scope = scope;
    requestFocus(`#scope-tab-${scope}`);
    this.refresh();
    if (this._sitePages === null) void this.loadSitePages();
  }

  // Shown at once; saved for the next time the panel opens (and for other windows).
  private async selectKind(kind: ScopeContentKind): Promise<void> {
    this._kind = kind;
    requestFocus(`#kind-tab-${kind}`);
    this.refresh();
    await runAction('Couldn\'t save that setting.', () => settingsService.setContentKind(kind));
  }

  // Something changed (here, in another window, or the storage area: `changed` null): the shown
  // lists reload if theirs did, the site's pages if one of its pages' did: the tab showing (keeping
  // the previous list meanwhile), else later. Other sites' changes cost nothing.
  private reload(changed: string[] | null): void {
    const keys = this._keys;
    if (!keys) return;
    const shown = SCOPES.flatMap((scope) => KINDS.map((kind) => storageKey(kind, scope, keys[scope])));
    if (!changed || changed.some((key) => shown.includes(key))) void this.load();
    if (changed && !changed.some((key) => isSitePageKey(key, keys.site))) return;
    if (this._scope === 'site') void this.loadSitePages();
    else this._sitePages = null;
  }

  // From any settings page back to the notes, or from the notes to the settings.
  private _toggleSettings(): void {
    if (this._settingsPage) this.openSettings(null, SETTINGS_TOGGLE);
    else this.openSettings('settings', SETTINGS_TITLE);
  }

  private openSettings(page: SettingsPage | null, focus: string): void {
    this._settingsPage = page;
    requestFocus(focus);
    this.refresh();
  }

  private async load(): Promise<void> {
    const keys = this._keys;
    const loadId = ++this._loadId;
    if (!keys) return;

    let content: ScopedContent;
    try {
      content = await scopeStoreService.load(keys);
    } catch (error) {
      if (loadId !== this._loadId) return;
      // What was shown stays (or empty lists), rather than a panel stuck loading.
      notifierService.error(`Couldn't load your notes. ${errorMessage(error)}`);
      content = this._content ?? EMPTY_CONTENT;
    }
    if (loadId !== this._loadId) return;
    this._content = content;
    this._pageLoading = false;
    this.refresh();
  }

  // Only on the "This site" tab: it reads every note and to-do of the storage area.
  private async loadSitePages(): Promise<void> {
    const keys = this._keys;
    const loadId = ++this._sitePagesLoadId;
    if (!keys || this._scope !== 'site') return;

    let pages: ISitePage[];
    try {
      pages = await scopeStoreService.listSitePages(keys.site);
    } catch (error) {
      if (loadId !== this._sitePagesLoadId) return;
      notifierService.error(`Couldn't list this site's pages. ${errorMessage(error)}`);
      // The list goes (no spinner left turning), unless one was shown already.
      pages = this._sitePages ?? [];
    }
    if (loadId !== this._sitePagesLoadId) return;
    this._sitePages = pages;
    this.refresh();
  }

  /**
   * Re-renders, keeping keyboard focus where it was. Kept children (lists, composers) keep theirs
   * through Nutin's preservation, but the tabs and the Settings toggle are rebuilt: a reload from
   * elsewhere (another window, Chrome sync) would drop them to <body>. Unless the action that
   * caused the render asked for focus somewhere else.
   */
  private refresh(): void {
    const own = this.ownFocusSelector();
    renderKeepingFocus(this.element, own ? [own] : [], () => {
      this.config = this.view();
      this.render();
    });
  }

  // A selector for the focused element, if it's one of the controls rebuilt on every render.
  private ownFocusSelector(): string | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.element.contains(active)) return null;
    if (active.matches('[role="tab"][id]')) return `#${active.id}`;
    if (active.matches(SETTINGS_TOGGLE)) return SETTINGS_TOGGLE;
    return null;
  }

  private view(): ISidebarView {
    return { settingsPage: this._settingsPage, available: this._keys !== null };
  }

  // What the scope panel shows; null on a page that can't have notes.
  private panelState(): IScopePanelState | null {
    if (!this._keys) return null;
    return {
      keys: this._keys,
      scope: this._scope,
      kind: this._kind,
      content: this._content ?? EMPTY_CONTENT,
      loaded: this._content !== null && !(this._scope === 'page' && this._pageLoading),
      sitePages: this._sitePages,
    };
  }
}
