import { Component, html } from '../../../core/index.js';
import { applyRequestedFocus, clearRequestedFocus, hasRequestedFocus, requestFocus } from '../../lib/focus.js';
import { errorMessage } from '../../lib/errors.js';
import { countList } from '../../lib/plural.js';
import { isSitePageKey, storageKey } from '../../lib/scope-keys.js';
import { activeTabService } from '../../services/active-tab/active-tab.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { settingsService } from '../../services/settings/settings.service.js';
import { scopeStoreService, type IScopedContent } from '../../services/scope-store/scope-store.service.js';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component.js';
import { NoteComposerComponent } from '../note-composer/note-composer.component.js';
import { NoteListComponent } from '../note-list/note-list.component.js';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component.js';
import { SiteManagerComponent } from '../site-manager/site-manager.component.js';
import { SitePagesComponent } from '../site-pages/site-pages.component.js';
import { TabsComponent } from '../tabs/tabs.component.js';
import { TodoListComponent } from '../todo-list/todo-list.component.js';

interface ISidebarView {
  keys: IScopeKeys | null;
  scope: NoteScope;
  kind: ScopeContentKind;
  loaded: boolean;
  settingsPage: SettingsPage | null;
  location: { text: string; full: string };
}

// What replaces the notes when Settings is open: the settings, or their "Manage by site" page.
type SettingsPage = 'settings' | 'sites';

const templateFn = ({ keys, scope, kind, loaded, settingsPage, location }: ISidebarView) => html`__TEMPLATE_PLACEHOLDER__`;

const PANEL_ID = 'sidebar-panel';
const KIND_PANEL_ID = 'sidebar-kind-panel';

const SCOPES: NoteScope[] = ['page', 'site'];
const KINDS: ScopeContentKind[] = ['notes', 'todos'];

const SCOPE_LABELS: Record<NoteScope, string> = { page: 'This page', site: 'This site' };
const KIND_LABELS: Record<ScopeContentKind, string> = { todos: 'To-dos', notes: 'Notes' };

// Before the first load (or after a failed one): empty lists rather than a panel stuck loading.
function emptyContent(): IScopedContent {
  return { page: { notes: [], todos: [] }, site: { notes: [], todos: [] } };
}

/**
 * The side panel's root: the active tab's page and site to-dos and notes, behind "This page" /
 * "This site" tabs, then "To-dos" / "Notes" tabs (the last one picked is a setting), or the
 * settings. Everything is loaded together, so switching tabs never waits.
 */
export class SidebarComponent extends Component<HTMLElement, ISidebarView> {
  private _keys: IScopeKeys | null;
  private _scope: NoteScope = 'page';
  private _kind: ScopeContentKind;
  private _content: IScopedContent | null = null;
  // The site's pages that have notes or to-dos, for the "This site" tab. Listing them reads the
  // whole storage area, so only while that tab shows; null: not loaded for this site yet.
  private _sitePages: ISitePage[] | null = null;
  private _settingsPage: SettingsPage | null = null;
  private _noteList: NoteListComponent | null = null;
  private _todoList: TodoListComponent | null = null;
  private _sitePagesList: SitePagesComponent | null = null;
  // Only the latest load's result is shown, however the requests resolve.
  private _loadId = 0;
  private _sitePagesLoadId = 0;

  constructor(mountTarget: string | HTMLElement) {
    super({ templateFn, mountTarget });
    this._keys = activeTabService.keys;
    this._kind = settingsService.contentKind;
    this.config = this.view();

    this.listen('active-scope-changed', ({ keys }) => {
      this._keys = keys;
      this._content = null;
      this._sitePages = null;
      this.refresh();
      void this.load();
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
    const keys = this._keys;
    const children: Nutin.ComponentConfig[] = [
      {
        selector: 'settings-panel',
        factory: (el) => new SettingsPanelComponent(el, { onManageSites: () => this.openSettings('sites', '#site-manager-title') }),
        keep: 'settings',
      },
      {
        selector: 'site-manager',
        factory: (el) => new SiteManagerComponent(el, { onBack: () => this.openSettings('settings', '.settings-panel__manage-sites') }),
        keep: 'sites',
      },
      // Asks before "Delete all" (see confirmService), from the lists and the settings alike.
      { selector: 'confirm-dialog', factory: (el) => new ConfirmDialogComponent(el), keep: 'confirm' },
    ];
    if (!keys) return children;

    const scope = this._scope;
    const kind = this._kind;
    const scopeKey = `${scope}|${keys[scope]}`;
    const content = this._content ?? emptyContent();
    const shown = counts(content[scope]);

    return [
      ...children,
      {
        selector: 'scope-tabs',
        factory: (el) => new TabsComponent<NoteScope>(el, {
          tabs: (['page', 'site'] as const).map((value) => {
            const { notes, todos } = counts(content[value]);
            return { value, label: SCOPE_LABELS[value], count: notes + todos, countText: scopeCountText(notes, todos) };
          }),
          active: scope,
          idPrefix: 'scope-tab',
          label: 'Show notes for',
          panelId: PANEL_ID,
          folder: true,
          onSelect: (selected) => this.selectScope(selected),
        }),
      },
      {
        selector: 'kind-tabs',
        factory: (el) => new TabsComponent<ScopeContentKind>(el, {
          tabs: (['notes', 'todos'] as const).map((value) => ({
            value,
            label: KIND_LABELS[value],
            count: shown[value],
            countText: kindCountText(value, shown[value]),
          })),
          active: kind,
          idPrefix: 'kind-tab',
          label: 'Show',
          panelId: KIND_PANEL_ID,
          small: true,
          grouped: true,
          onSelect: (selected) => void this.selectKind(selected),
        }),
      },
      // Kept while on the same site: open or closed survives navigating between its pages.
      {
        selector: 'site-pages',
        factory: (el) => (this._sitePagesList = new SitePagesComponent(el, { pages: this._sitePages, currentPage: keys.page })),
        keep: keys.site,
      },
      // Kept while on the same scope and page: drafts and the lists' DOM survive other renders.
      {
        selector: 'todo-list',
        factory: (el) => (this._todoList = new TodoListComponent(el, { scope, keys, todos: content[scope].todos })),
        keep: scopeKey,
      },
      { selector: 'note-composer', factory: (el) => new NoteComposerComponent(el, { scope, key: keys[scope] }), keep: scopeKey },
      {
        selector: 'note-list',
        factory: (el) => (this._noteList = new NoteListComponent(el, { scope, keys, notes: content[scope].notes })),
        keep: scopeKey,
      },
    ];
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    // Kept lists still show the previous items: hand them the new ones, then place the focus.
    const content = this._content?.[this._scope];
    if (content && this._todoList && this.element.contains(this._todoList.getElement())) {
      this._todoList.update(content.todos);
    }
    if (content && this._noteList && this.element.contains(this._noteList.getElement())) {
      this._noteList.update(content.notes);
    }
    if (this._sitePagesList && this._keys && this.element.contains(this._sitePagesList.getElement())) {
      this._sitePagesList.update(this._sitePages, this._keys.page);
    }
    applyRequestedFocus(this.element);
  }

  private selectScope(scope: NoteScope): void {
    this._scope = scope;
    requestFocus(`#scope-tab-${scope}`);
    this.refresh();
    if (this._sitePages === null) void this.loadSitePages();
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

  // Shown at once; saved for the next time the panel opens (and for other windows).
  private async selectKind(kind: ScopeContentKind): Promise<void> {
    this._kind = kind;
    requestFocus(`#kind-tab-${kind}`);
    this.refresh();
    try {
      await settingsService.setContentKind(kind);
    } catch (error) {
      clearRequestedFocus();
      notifierService.error(`Couldn't save that setting. ${errorMessage(error)}`);
    }
  }

  // From any settings page back to the notes, or from the notes to the settings.
  private _toggleSettings(): void {
    if (this._settingsPage) this.openSettings(null, '.sidebar__settings-toggle');
    else this.openSettings('settings', '#settings-title');
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

    let content: IScopedContent;
    try {
      content = await scopeStoreService.load(keys);
    } catch (error) {
      if (loadId !== this._loadId) return;
      // What was shown stays (or empty lists), rather than a panel stuck loading.
      notifierService.error(`Couldn't load your notes. ${errorMessage(error)}`);
      content = this._content ?? emptyContent();
    }
    if (loadId !== this._loadId) return;
    this._content = content;
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
   * through Nutin's preservation, but this component's own controls (the scope tabs, the Settings
   * toggle) are rebuilt: a reload from elsewhere (another window, Chrome sync) would drop them to
   * <body>. Unless the action that caused the render asked for focus somewhere else.
   */
  private refresh(): void {
    const focused = this.ownFocusSelector();
    const requested = hasRequestedFocus();
    this.config = this.view();
    this.render();
    if (!focused || requested || this.element.contains(document.activeElement)) return;
    this.element.querySelector<HTMLElement>(focused)?.focus();
  }

  // A selector for the focused element, if it's one of the controls rebuilt on every render.
  private ownFocusSelector(): string | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.element.contains(active)) return null;
    if (active.matches('[role="tab"][id]')) return `#${active.id}`;
    if (active.matches('.sidebar__settings-toggle')) return '.sidebar__settings-toggle';
    return null;
  }

  private view(): ISidebarView {
    const keys = this._keys;
    const onPage = this._scope === 'page';
    return {
      keys,
      scope: this._scope,
      kind: this._kind,
      loaded: this._content !== null,
      settingsPage: this._settingsPage,
      location: keys
        ? { text: onPage ? keys.pageLabel : keys.siteLabel, full: onPage ? keys.page : keys.site }
        : { text: '', full: '' },
    };
  }
}

// What the tabs count: notes, and the to-dos still open.
function counts({ notes, todos }: IScopedContent[NoteScope]): Record<ScopeContentKind, number> {
  return { notes: notes.length, todos: todos.filter((todo) => !todo.done).length };
}

// How a scope tab's count is read out, e.g. ", 2 notes, 1 to-do".
function scopeCountText(notes: number, todos: number): string {
  return `, ${countList([[notes, 'note'], [todos, 'to-do']], ', ') || 'no items'}`;
}

// How a kind tab's count is read out: ", 2" alone would be unclear next to "To-dos".
function kindCountText(kind: ScopeContentKind, count: number): string {
  if (kind === 'notes') return `, ${count === 0 ? 'none' : count}`;
  return `, ${count === 0 ? 'none' : count} open`;
}
