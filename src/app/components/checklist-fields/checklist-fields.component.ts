import { Component, html } from '../../../core/index.js';
import { byData } from '../../lib/focus.js';
import { ChecklistFieldComponent, type IChecklistFieldOptions } from '../checklist-field/checklist-field.component.js';

export interface IChecklistFieldsConfig {
  items: IChecklistItem[];
  // The list's accessible name, and its class in the parent's styles.
  label: string;
  className: string;
  onEscape: () => void;
  // The last field was removed: the parent moves the focus (there's no previous field to take it).
  onLastRemoved: () => void;
  // Set to offer "Take out" on each item (the list editor): it leaves the fields, handed over here.
  onTakeOut?: (item: IChecklistItem) => void;
  // Fields added, removed or reset (not typed in: read those with values()).
  onChange?: () => void;
}

interface IChecklistFieldsView {
  hasItems: boolean;
  label: string;
  className: string;
}

const templateFn = ({ hasItems, label, className }: IChecklistFieldsView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * A checklist being written: one field per item (Enter adds the next one, Remove removes it).
 * The parent keeps it across its own renders, so adding or removing an item never rebuilds
 * the parent's other fields; it reads the items back with values().
 */
export class ChecklistFieldsComponent extends Component<HTMLElement, IChecklistFieldsView> {
  private _fields: IChecklistItem[];
  private _options: IChecklistFieldsConfig;
  private readonly _fieldOptions: IChecklistFieldOptions;

  constructor(mountTarget: HTMLElement, options: IChecklistFieldsConfig) {
    super({ templateFn, mountTarget, config: { hasItems: options.items.length > 0, label: options.label, className: options.className } });
    this._fields = options.items;
    this._fieldOptions = {
      onEnter: (id) => this.insertAfter(id),
      onRemove: (id) => this.remove(id),
      onEscape: () => this._options.onEscape(),
      ...(options.onTakeOut ? { onTakeOut: (id: string) => this.remove(id, true) } : {}),
    };
    this._options = options;
  }

  public get count(): number {
    return this._fields.length;
  }

  public override registerChildren(): Nutin.ComponentConfig[] {
    // Rebuilt from _fields on every render (each one's number changes as fields come and go).
    return this.createCatalogComponents({
      items: this._fields,
      selector: 'fields',
      elementName: 'field',
      elementTag: 'li',
      component: ChecklistFieldComponent,
      props: this._fieldOptions,
    });
  }

  // The items as typed (empty ones included: the parent decides what to keep).
  public values(): IChecklistItem[] {
    this.collect();
    return this._fields;
  }

  // Adds a field at the end, focused: empty, or for an item given back (e.g. "Put back").
  public add(item: IChecklistItem = newField()): void {
    this.collect();
    const field = item;
    this._fields = [...this._fields, field];
    this.refresh();
    this.focusField(field.id);
  }

  public reset(items: IChecklistItem[]): void {
    this._fields = items;
    this.refresh();
  }

  private insertAfter(id: string): void {
    this.collect();
    const field = newField();
    const index = this._fields.findIndex((f) => f.id === id);
    this._fields = [...this._fields.slice(0, index + 1), field, ...this._fields.slice(index + 1)];
    this.refresh();
    this.focusField(field.id);
  }

  // Removed, or taken out (handed to onTakeOut): either way the field goes, focus to the previous one.
  private remove(id: string, takeOut = false): void {
    this.collect();
    const index = this._fields.findIndex((f) => f.id === id);
    const field = this._fields[index];
    this._fields = this._fields.filter((f) => f.id !== id);
    if (takeOut && field) this._options.onTakeOut?.(field);
    this.refresh();
    const previous = this._fields[Math.max(0, index - 1)];
    if (previous) this.focusField(previous.id);
    else this._options.onLastRemoved();
  }

  // What's been typed, back into the state, before a render rebuilds the fields.
  private collect(): void {
    this._fields = this._fields.map((field) => ({
      ...field,
      // Every field is rendered.
      text: this.element.querySelector<HTMLInputElement>(`${byData('item-id', field.id)} .checklist-field__input`)!.value,
    }));
  }

  private refresh(): void {
    this.config = { ...this.config, hasItems: this._fields.length > 0 };
    this.render();
    this._options.onChange?.();
  }

  private focusField(id: string): void {
    this.element.querySelector<HTMLInputElement>(`${byData('item-id', id)} .checklist-field__input`)!.focus();
  }
}

function newField(): IChecklistItem {
  return { id: crypto.randomUUID(), text: '', done: false };
}
