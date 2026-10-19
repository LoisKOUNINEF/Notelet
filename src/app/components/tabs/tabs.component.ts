import { Component, html } from '../../../core/index.js';

export interface ITab<T extends string> {
  value: T;
  label: string;
  count: number;
  // Screen-reader wording of the count, e.g. ", 2 notes, 1 to-do".
  countText: string;
}

export interface ITabsConfig<T extends string> {
  tabs: ITab<T>[];
  active: T;
  // Each tab's id is `<idPrefix>-<value>`: its panel is labelled by it.
  idPrefix: string;
  // The tablist's accessible name.
  label: string;
  // The id of the tab panel every tab controls.
  panelId: string;
  // Small: a tab row nested inside another one's panel.
  small?: boolean;
  // Inside a container that draws the background for several rows.
  grouped?: boolean;
  // Folder tabs: the selected one opens into the content below it, drawn by the parent with
  // the same surface (--tabs-folder-surface), so what's below reads as that tab's own content.
  folder?: boolean;
  onSelect: (value: T) => void;
}

interface ITabView extends ITab<string> {
  id: string;
  selected: boolean;
}

interface ITabsView {
  tabs: ITabView[];
  label: string;
  panelId: string;
  small: boolean;
  grouped: boolean;
  folder: boolean;
}

const templateFn = ({ tabs, label, panelId, small, grouped, folder }: ITabsView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * A row of tabs (WAI-ARIA tabs pattern, automatic activation): one Tab stop, ←/→ (and
 * Home/End) move between tabs and show their panel at once. Used for "This page" / "This site",
 * and for "To-dos" / "Notes" inside it.
 */
export class TabsComponent<T extends string> extends Component<HTMLElement, ITabsView> {
  private _values: T[];
  private _active: T;
  private _onSelect: (value: T) => void;

  constructor(mountTarget: HTMLElement, { tabs, active, idPrefix, label, panelId, small = false, grouped = false, folder = false, onSelect }: ITabsConfig<T>) {
    super({
      templateFn,
      mountTarget,
      config: {
        label,
        panelId,
        small,
        grouped,
        folder,
        tabs: tabs.map((tab) => ({ ...tab, id: `${idPrefix}-${tab.value}`, selected: tab.value === active })),
      },
    });
    this._values = tabs.map((tab) => tab.value);
    this._active = active;
    this._onSelect = onSelect;
  }

  private _select(value: string): void {
    if (this.isValue(value) && value !== this._active) this._onSelect(value);
  }

  private _onKeydown(event: KeyboardEvent): void {
    const values = this._values;
    const index = values.indexOf(this._active);
    const next: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: values.length - 1,
    };
    if (!(event.key in next)) return;

    event.preventDefault();
    // Wraps around at both ends.
    this._select(values[(next[event.key]! + values.length) % values.length]!);
  }

  private isValue(value: string): value is T {
    return (this._values as string[]).includes(value);
  }
}
