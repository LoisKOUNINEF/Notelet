import { Component, html } from '../../../core/index.js';
import { countList } from '../../lib/plural.js';
import type { IScopeContent, ScopedContent } from '../../services/scope-store/scope-store.service.js';
import { NoteComposerComponent } from '../note-composer/note-composer.component.js';
import { NoteListComponent } from '../note-list/note-list.component.js';
import { SitePagesComponent } from '../site-pages/site-pages.component.js';
import { TabsComponent } from '../tabs/tabs.component.js';
import { TodoListComponent } from '../todo-list/todo-list.component.js';

// What the sidebar shows here: the active tab's keys, the tabs picked and what's loaded.
export interface IScopePanelState {
  keys: IScopeKeys;
  scope: NoteScope;
  kind: ScopeContentKind;
  content: ScopedContent;
  // The shown scope's lists are loaded (until then they wait: no "nothing yet" flashing by).
  loaded: boolean;
  // The site's pages with notes or to-dos (the "This site" tab); null while they're listed.
  sitePages: ISitePage[] | null;
}

export interface IScopePanelOptions {
  onSelectScope: (scope: NoteScope) => void;
  onSelectKind: (kind: ScopeContentKind) => void;
}

interface IScopePanelView {
  scope: NoteScope;
  kind: ScopeContentKind;
  loaded: boolean;
  location: { text: string; full: string };
}

const templateFn = ({ scope, kind, loaded, location }: IScopePanelView) => html`__TEMPLATE_PLACEHOLDER__`;

const SCOPE_LABELS: Record<NoteScope, string> = { page: 'This page', site: 'This site' };
const KIND_LABELS: Record<ScopeContentKind, string> = { todos: 'To-dos', notes: 'Notes' };

/**
 * The active tab's page or site: where it is, the "This page" / "This site" tabs, the
 * "To-dos" / "Notes" tabs inside them, and that scope's lists. The sidebar owns what's shown (it
 * loads it and keeps it while Settings is open) and hands it over through update(); the lists
 * are kept across those updates while on the same scope and key.
 */
export class ScopePanelComponent extends Component<HTMLElement, IScopePanelView> {
  private _state: IScopePanelState;
  private readonly _options: IScopePanelOptions;
  private _noteList: NoteListComponent | null = null;
  private _todoList: TodoListComponent | null = null;
  private _sitePages: SitePagesComponent | null = null;

  constructor(mountTarget: HTMLElement, state: IScopePanelState, options: IScopePanelOptions) {
    super({ templateFn, mountTarget, props: { className: 'scope-panel' }, config: ScopePanelComponent.viewOf(state) });
    this._state = state;
    this._options = options;
  }

  private static viewOf({ keys, scope, kind, loaded }: IScopePanelState): IScopePanelView {
    const onPage = scope === 'page';
    return {
      scope,
      kind,
      loaded,
      location: { text: onPage ? keys.pageLabel : keys.siteLabel, full: onPage ? keys.page : keys.site },
    };
  }

  // Re-rendered only when something shown changed (the sidebar hands it over on its every render).
  public update(state: IScopePanelState): void {
    const previous = this._state;
    const same = (Object.keys(state) as (keyof IScopePanelState)[]).every((key) => state[key] === previous[key]);
    if (same) return;
    this._state = state;
    this.config = ScopePanelComponent.viewOf(state);
    this.render();
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    const { keys, scope, kind, content, sitePages } = this._state;
    const scopeKey = `${scope}|${keys[scope]}`;
    const shown = counts(content[scope]);

    return [
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
          panelId: 'scope-tabpanel',
          folder: true,
          onSelect: this._options.onSelectScope,
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
          panelId: 'kind-tabpanel',
          small: true,
          grouped: true,
          onSelect: this._options.onSelectKind,
        }),
      },
      // Kept while on the same site: open or closed survives navigating between its pages.
      {
        selector: 'site-pages',
        factory: (el) => (this._sitePages = new SitePagesComponent(el, { pages: sitePages, currentPage: keys.page })),
        keep: keys.site,
      },
      // Kept while on the same scope and key: drafts and the lists' DOM survive other renders.
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

  // Kept lists still show the previous items: hand them the new ones.
  protected override onAfterRender(): void {
    super.onAfterRender();
    const { keys, scope, content, sitePages } = this._state;
    if (this.shows(this._todoList)) this._todoList.update(content[scope].todos);
    if (this.shows(this._noteList)) this._noteList.update(content[scope].notes);
    if (this.shows(this._sitePages)) this._sitePages.update(sitePages, keys.page);
  }

  // A child created by registerChildren() that's still in the panel (not one replaced since).
  private shows<C extends Component>(child: C | null): child is C {
    return child !== null && this.element.contains(child.getElement());
  }
}

// What the tabs count: notes, and the to-dos still open.
function counts({ notes, todos }: IScopeContent): Record<ScopeContentKind, number> {
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
