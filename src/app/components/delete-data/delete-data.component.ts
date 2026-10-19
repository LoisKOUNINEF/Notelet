import { Component, html, raw } from '../../../core/index.js';
import { AGES, DEFAULT_AGE, ageOption, cutoff, isAge, type Age } from '../../lib/ages.js';
import { errorMessage } from '../../lib/errors.js';
import { removeOverlays } from '../../lib/overlays.js';
import { countList } from '../../lib/plural.js';
import { confirmService } from '../../services/confirm/confirm.service.js';
import { notifierService } from '../../services/notifier/notifier.service.js';
import { scopeStoreService, type IStoredItem } from '../../services/scope-store/scope-store.service.js';
import { settingsService } from '../../services/settings/settings.service.js';

interface ICounts {
  notes: number;
  todos: number;
}

interface IDeleteDataView {
  ages: { value: Age; label: string; selected: boolean }[];
  // What each would delete ('' when nothing, or while counting), shown in its button's tooltip.
  olderText: string;
  allText: string;
  // Nothing to delete: the button is aria-disabled (still focusable), its tooltip says why.
  olderNothing: string | null;
  allNothing: string | null;
  // Counting, or the notes moving between storage areas: the button is disabled.
  olderDisabled: boolean;
  allDisabled: boolean;
  busy: boolean;
}

const templateFn = ({ ages, olderText, allText, olderNothing, allNothing, olderDisabled, allDisabled, busy }: IDeleteDataView) => html`__TEMPLATE_PLACEHOLDER__`;

// The controls whose focus survives a re-render (counts change under them), in fallback order.
const FOCUSABLE = ['.delete-data__select', '.delete-data__older-button', '.delete-data__all-button'];

/**
 * Settings' "Delete everything" section: "Delete all older than <age>", then "Delete all notes
 * and to-dos". Both say how many notes and to-dos they'd delete, on every page and site, and are
 * disabled when that's none. Counts follow every change (here or in another window), and the
 * minutes passing while Settings stays open.
 */
export class DeleteDataComponent extends Component<HTMLElement, IDeleteDataView> {
  private _age: Age = DEFAULT_AGE;
  // null while loading; also kept null after a failed load (counts unknown, buttons usable).
  private _items: IStoredItem[] | null = null;
  private _loading = true;
  private _busy = false;
  // Only the latest load's result is shown.
  private _loadId = 0;
  private _destroyed = false;

  constructor(mountTarget: HTMLElement) {
    super({ templateFn, mountTarget, config: DeleteDataComponent.emptyView() });
    this.config = this.view();
    this.listen('scope-content-changed', () => void this.load());
    this.listen('storage-area-changed', () => void this.load());
    // An item can cross the cutoff while Settings stays open. Only re-rendered when a count
    // changed: a re-render rebuilds the <select>, which would close its popup if it's open.
    this.listen('minute-tick', () => {
      if (JSON.stringify(this.view()) !== JSON.stringify(this.config)) this.refresh();
    });
    void this.load();
  }

  private static emptyView(): IDeleteDataView {
    return { ages: [], olderText: '', allText: '', olderNothing: null, allNothing: null, olderDisabled: true, allDisabled: true, busy: false };
  }

  // Disabled while the settings move the notes to another storage area.
  public update({ busy }: { busy: boolean }): void {
    if (busy === this._busy) return;
    this._busy = busy;
    this.refresh();
  }

  private async load(): Promise<void> {
    const loadId = ++this._loadId;
    try {
      const items = await scopeStoreService.listEverything();
      if (loadId !== this._loadId) return;
      this._items = items;
    } catch (error) {
      if (loadId !== this._loadId) return;
      this._items = null;
      notifierService.error(`Couldn't count your notes. ${errorMessage(error)}`);
    }
    this._loading = false;
    this.refresh();
  }

  private _setAge(select: HTMLSelectElement): void {
    if (!isAge(select.value) || select.value === this._age) return;
    this._age = select.value;
    this.refresh();
  }

  private async _deleteOlder(): Promise<void> {
    if (this.config.olderNothing) return;
    const age = ageOption(this._age);
    const old = this.oldCounts();
    const confirmed = await confirmService.ask({
      title: `Delete what's older than ${age.label}?`,
      message: `${old ? countText(old) : 'Every note and to-do'} not edited in the last ${age.since}, on every page and site.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    try {
      // From the moment it's confirmed: the popup may have stayed open a while.
      const removed = await scopeStoreService.removeOlderThan(cutoff(this._age, Date.now()));
      const items = Object.values(removed).flat();
      if (items.length === 0) {
        notifierService.info(`Nothing older than ${age.label} to delete.`);
        return;
      }
      const todoKeys = Object.keys(removed).filter((key) => key.startsWith('todos:'));
      const todos = todoKeys.reduce((sum, key) => sum + removed[key]!.length, 0);
      notifierService.undoable(`${countText({ notes: items.length - todos, todos })} deleted.`, () => scopeStoreService.restoreRemoved(removed), `Couldn't restore them.`);
    } catch (error) {
      notifierService.error(`Couldn't delete the older notes. ${errorMessage(error)}`);
    }
  }

  private async _deleteEverything(): Promise<void> {
    if (this.config.allNothing) return;
    const all = this.allCounts();
    const synced = settingsService.storageArea === 'sync';
    const confirmed = await confirmService.ask({
      title: 'Delete all your notes and to-dos?',
      message: `${all ? countText(all) : 'Every note and to-do'}, on every page and site. This can't be undone.${synced ? ' They\'ll also be removed from your other computers.' : ''}`,
      confirmLabel: 'Delete everything',
    });
    if (!confirmed) return;

    try {
      await scopeStoreService.clearEverything();
      notifierService.success('All your notes and to-dos were deleted.');
    } catch (error) {
      notifierService.error(`Couldn't delete your notes. ${errorMessage(error)}`);
    }
  }

  // Null when unknown (still loading, or the load failed).
  private allCounts(): ICounts | null {
    return this._items ? counts(this._items) : null;
  }

  private oldCounts(): ICounts | null {
    if (!this._items) return null;
    const before = cutoff(this._age, Date.now());
    return counts(this._items.filter(({ item }) => item.updatedAt < before));
  }

  private view(): IDeleteDataView {
    const age = ageOption(this._age);
    const all = this.allCounts();
    const old = this.oldCounts();
    const none = (c: ICounts | null) => !!c && c.notes + c.todos === 0;
    // Nothing to say while counting (the buttons are disabled), or after a failed count.
    const known = (c: ICounts | null, text: (c: ICounts) => string) => (!this._loading && c ? text(c) : '');
    return {
      ages: AGES.map(({ value, label }) => ({ value, label, selected: value === this._age })),
      olderText: known(old, (c) => (none(c) ? '' : `${countText(c)} not edited in the last ${age.since}.`)),
      allText: known(all, (c) => (none(c) ? '' : `${countText(c)}, on every page and site.`)),
      olderNothing: !this._loading && none(old) ? `Nothing older than ${age.label}.` : null,
      allNothing: !this._loading && none(all) ? 'No notes or to-dos yet.' : null,
      olderDisabled: this._busy || this._loading,
      allDisabled: this._busy || this._loading,
      busy: this._busy,
    };
  }

  // The "nothing to delete" tooltips are overlays on <body> (see lib/overlays.ts).
  protected override onBeforeRender(): void {
    removeOverlays(this.element, '.delete-data__overlays');
    super.onBeforeRender();
  }

  protected override onBeforeDestroy(): void {
    this._destroyed = true;
    removeOverlays(this.element, '.delete-data__overlays');
    super.onBeforeDestroy();
  }

  // Re-renders with fresh counts, keeping keyboard focus on the control that had it (or the
  // next one still usable: a button just disabled can't keep it).
  private refresh(): void {
    // Settings closed while counting: nothing left to show the counts in.
    if (this._destroyed) return;
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && this.element.contains(active)
      ? FOCUSABLE.findIndex((selector) => active.matches(selector))
      : -1;
    this.config = this.view();
    this.render();
    if (focused === -1) return;
    const target = [...FOCUSABLE.slice(focused), ...FOCUSABLE.slice(0, focused)]
      .map((selector) => this.element.querySelector<HTMLElement & { disabled?: boolean }>(selector))
      .find((el) => el && !el.disabled);
    target?.focus();
  }
}

function counts(items: IStoredItem[]): ICounts {
  const todos = items.filter(({ kind }) => kind === 'todos').length;
  return { notes: items.length - todos, todos };
}

// "2 notes and 1 to-do", "3 to-dos"...: a kind with none isn't named.
export function countText({ notes, todos }: ICounts): string {
  return countList([[notes, 'note'], [todos, 'to-do']]) || 'No notes or to-dos';
}
