import { Component, html } from '../../../core/index.js';
import { applyRequestedFocus, requestFocus } from '../../lib/focus.js';
import { activeTabService } from '../../services/active-tab/active-tab.service.js';
import { scopeStoreService, type IScopedContent } from '../../services/scope-store/scope-store.service.js';
import { NoteComposerComponent } from '../note-composer/note-composer.component.js';
import { NoteListComponent } from '../note-list/note-list.component.js';
import { ScopeTabsComponent, type IScopeCounts } from '../scope-tabs/scope-tabs.component.js';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component.js';
import { TodoListComponent } from '../todo-list/todo-list.component.js';

interface ISidebarView {
  keys: IScopeKeys | null;
  scope: NoteScope;
  loaded: boolean;
  settingsOpen: boolean;
  location: { text: string; full: string };
}

const templateFn = ({ keys, scope, loaded, settingsOpen, location }: ISidebarView) => html`__TEMPLATE_PLACEHOLDER__`;

const PANEL_ID = 'sidebar-panel';

/**
 * The side panel's root: the active tab's page and site to-dos and notes, behind "This page" /
 * "This site" tabs, or the settings. Both scopes are loaded together, so switching tabs never waits.
 */
export class SidebarComponent extends Component<HTMLElement, ISidebarView> {
  private _keys: IScopeKeys | null;
  private _scope: NoteScope = 'page';
  private _content: IScopedContent | null = null;
  private _settingsOpen = false;
  private _noteList: NoteListComponent | null = null;
  private _todoList: TodoListComponent | null = null;
  // Only the latest load's result is shown, however the requests resolve.
  private _loadId = 0;

  constructor(mountTarget: string | HTMLElement) {
    super({ templateFn, mountTarget });
    this._keys = activeTabService.keys;
    this.config = this.view();

    this.listen('active-scope-changed', ({ keys }) => {
      this._keys = keys;
      this._content = null;
      this.refresh();
      void this.load();
    });
    this.listen('scope-content-changed', () => void this.load());
    this.listen('storage-area-changed', () => void this.load());
    void this.load();
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    const keys = this._keys;
    const children: Nutin.ComponentConfig[] = [
      { selector: 'settings-panel', factory: (el) => new SettingsPanelComponent(el), keep: 'settings' },
    ];
    if (!keys) return children;

    const scope = this._scope;
    const scopeKey = `${scope}|${keys[scope]}`;
    const empty = { notes: [], todos: [] };
    const content = this._content ?? { page: empty, site: empty };

    return [
      ...children,
      {
        selector: 'scope-tabs',
        factory: (el) => new ScopeTabsComponent(el, {
          active: scope,
          counts: { page: counts(content.page), site: counts(content.site) },
          panelId: PANEL_ID,
          onSelect: (selected) => this.selectScope(selected),
        }),
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
    applyRequestedFocus(this.element);
  }

  private selectScope(scope: NoteScope): void {
    this._scope = scope;
    requestFocus(`#scope-tab-${scope}`);
    this.refresh();
  }

  private _toggleSettings(): void {
    this._settingsOpen = !this._settingsOpen;
    requestFocus(this._settingsOpen ? '#settings-title' : '.sidebar__settings-toggle');
    this.refresh();
  }

  private async load(): Promise<void> {
    const keys = this._keys;
    const loadId = ++this._loadId;
    if (!keys) return;

    const content = await scopeStoreService.load(keys);
    if (loadId !== this._loadId) return;
    this._content = content;
    this.refresh();
  }

  private refresh(): void {
    this.config = this.view();
    this.render();
  }

  private view(): ISidebarView {
    const keys = this._keys;
    return {
      keys,
      scope: this._scope,
      loaded: this._content !== null,
      settingsOpen: this._settingsOpen,
      location: keys
        ? { text: this._scope === 'page' ? keys.pageLabel : keys.siteLabel, full: this._scope === 'page' ? keys.page : keys.site }
        : { text: '', full: '' },
    };
  }
}

// What the tab shows: notes plus the to-dos still open.
function counts({ notes, todos }: IScopedContent[NoteScope]): IScopeCounts {
  return { notes: notes.length, todos: todos.filter((todo) => !todo.done).length };
}
