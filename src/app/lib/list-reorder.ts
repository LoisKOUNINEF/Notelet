import { announce } from './announce.js';
import { byData } from './focus.js';
import { moveId, targetIndex } from './reorder.js';

// What a list (the open to-dos, the notes) gives the reorder gestures to work with.
export interface IReorderHost {
  // The list's own element: handle events are delegated to it.
  root: HTMLElement;
  // The reorderable items' list (a catalog), each child being one item.
  listSelector: string;
  // Each item's grab handle.
  handleSelector: string;
  // The data attribute holding each item's id on its root, e.g. `todo-id` for `data-todo-id`.
  idAttribute: string;
  // Set on the item being dragged.
  draggingClass: string;
  // The reorderable items' ids, in the order shown.
  ids(): string[];
  textOf(id: string): string;
  // Shows `order` (null: the stored one) with `grabbedId` picked up, focus back on its handle.
  preview(order: string[] | null, grabbedId: string | null): void;
  // Saves the new order (resolves to whether it was saved); focus ends on the moved item's handle.
  commit(order: string[], movedId: string): Promise<boolean>;
  // A gesture ended. `saved`: a new order was written, whose own reload brings everything fresh,
  // so updates held back meanwhile (older than it) are dropped; otherwise they can be applied.
  settle(saved: boolean): void;
}

interface IKeyboardGrab {
  id: string;
  original: string[];
  order: string[];
}

interface IPointerDrag {
  id: string;
  pointerId: number;
  startY: number;
  items: HTMLElement[];
  midpoints: number[];
  from: number;
  to: number;
  height: number;
}

/**
 * Reordering a list's items by their grab handles:
 * - keyboard: Space/Enter picks up, ↑/↓/Home/End move, Space/Enter or Tab drops, Escape cancels,
 *   each step announced;
 * - pointer (mouse, pen, touch): drag the handle, the others slide aside, release to drop.
 */
export class ListReorder {
  private _grab: IKeyboardGrab | null = null;
  private _drag: IPointerDrag | null = null;
  // Set while preview() re-renders: the handle losing focus then isn't a drop.
  private _previewing = false;
  // While dragging: the panel losing focus (another window, an OS gesture) cancels the drag.
  private readonly _onWindowBlur = () => this.endDrag(false);
  // The host list was destroyed: nothing reaches it any more (see dispose()).
  private _disposed = false;

  constructor(private readonly host: IReorderHost) {}

  public get active(): boolean {
    return this._grab !== null || this._drag !== null;
  }

  public get grabbedId(): string | null {
    return this._grab?.id ?? null;
  }

  public get previewOrder(): string[] | null {
    return this._grab?.order ?? null;
  }

  /**
   * For the host's onBeforeDestroy(): drops a grab or drag in progress without calling the host
   * back, and releases the window listener a drag holds (which would otherwise keep the destroyed
   * list alive, and later drop into it). A save already sent finishes, but isn't reported back.
   */
  public dispose(): void {
    this._disposed = true;
    this._grab = null;
    this.releaseDrag();
  }

  // The listeners, for the host to bind on its root (and unbind with its own).
  public listeners(): Array<[string, EventListener]> {
    return [
      ['keydown', (e) => this.onKeydown(e as KeyboardEvent)],
      ['focusout', () => this.onFocusout()],
      ['pointerdown', (e) => this.onPointerdown(e as PointerEvent)],
      ['pointermove', (e) => this.onPointermove(e as PointerEvent)],
      ['pointerup', (e) => this.onPointerup(e as PointerEvent)],
      ['pointercancel', () => this.endDrag(false)],
      // Capture lost without a pointerup reaching the list (context menu, OS gesture...): without
      // this the drag would never end, and the list would hold every update.
      ['lostpointercapture', () => this.endDrag(false)],
    ];
  }

  private onKeydown(event: KeyboardEvent): void {
    if (this._drag) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.endDrag(false);
      }
      return;
    }
    const id = this.handleId(event.target);
    if (!id) return;

    if (!this._grab) {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        this.pickUp(id);
      }
      return;
    }

    const { order } = this._grab;
    const index = order.indexOf(this._grab.id);
    const targets: Record<string, number> = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: order.length - 1 };

    if (event.key in targets) {
      event.preventDefault();
      this.moveTo(targets[event.key]!);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      void this.drop();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  }

  // Tabbing away (or clicking elsewhere) drops the item where it is. The re-renders that move
  // the handle itself happen while previewing.
  private onFocusout(): void {
    if (!this._grab || this._previewing) return;
    void this.drop();
  }

  private pickUp(id: string): void {
    const order = this.host.ids();
    this._grab = { id, original: order, order };
    this.preview(id);
    announce(`Picked up ${this.host.textOf(id)}. Position ${order.indexOf(id) + 1} of ${order.length}.`);
  }

  private moveTo(index: number): void {
    const grab = this._grab!;
    const order = moveId(grab.order, grab.id, index);
    if (order.join() === grab.order.join()) return;
    grab.order = order;
    this.preview(grab.id);
    announce(`Moved to position ${order.indexOf(grab.id) + 1} of ${order.length}.`);
  }

  private async drop(): Promise<void> {
    const { id, original, order } = this._grab!;
    this._grab = null;
    const text = this.host.textOf(id);
    if (order.join() === original.join()) {
      this.preview(id);
      announce(`Dropped ${text}.`);
      this.settle(false);
      return;
    }
    announce(`Dropped ${text} at position ${order.indexOf(id) + 1} of ${order.length}.`);
    this.settle(await this.host.commit(order, id));
  }

  private cancel(): void {
    const { id } = this._grab!;
    this._grab = null;
    this.preview(id);
    announce('Reorder cancelled.');
    this.settle(false);
  }

  // Re-renders the list with the current grab (if any), focus back on `focusId`'s handle.
  private preview(focusId: string): void {
    this._previewing = true;
    try {
      this.host.preview(this.previewOrder, this.grabbedId);
      this.focusHandle(focusId);
    } finally {
      this._previewing = false;
    }
  }

  private onPointerdown(event: PointerEvent): void {
    const id = this.handleId(event.target);
    if (!id || this._grab || !event.isPrimary || event.button > 0) return;
    const handle = event.target as HTMLElement;
    const items = Array.from(this.host.root.querySelector(this.host.listSelector)!.children) as HTMLElement[];
    const from = items.findIndex((item) => item.contains(handle));
    const rects = items.map((item) => item.getBoundingClientRect());

    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    items[from]!.classList.add(this.host.draggingClass);
    window.addEventListener('blur', this._onWindowBlur);
    this._drag = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      items,
      midpoints: rects.map((rect) => rect.top + rect.height / 2),
      from,
      to: from,
      height: rects[from]!.height,
    };
  }

  private onPointermove(event: PointerEvent): void {
    const drag = this._drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.to = targetIndex(event.clientY, drag.midpoints, drag.from);

    drag.items.forEach((item, i) => {
      if (i === drag.from) {
        item.style.transform = `translateY(${event.clientY - drag.startY}px)`;
        return;
      }
      // The ones the dragged item passed make room for it, the others stay.
      const shift = drag.from < drag.to && i > drag.from && i <= drag.to ? -drag.height
        : drag.from > drag.to && i < drag.from && i >= drag.to ? drag.height
        : 0;
      item.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  private onPointerup(event: PointerEvent): void {
    if (!this._drag || event.pointerId !== this._drag.pointerId) return;
    this.endDrag(true);
  }

  private endDrag(keep: boolean): void {
    const drag = this.releaseDrag();
    if (!drag) return;

    const order = this.host.ids();
    if (keep && drag.to !== drag.from) {
      const next = moveId(order, drag.id, drag.to);
      announce(`Moved ${this.host.textOf(drag.id)} to position ${drag.to + 1} of ${order.length}.`);
      void this.host.commit(next, drag.id).then((saved) => this.settle(saved));
      return;
    }
    this.focusHandle(drag.id);
    this.settle(false);
  }

  // Ends the pointer drag in progress, if any: its window listener and the items' drag styles.
  private releaseDrag(): IPointerDrag | null {
    const drag = this._drag;
    if (!drag) return null;
    this._drag = null;
    window.removeEventListener('blur', this._onWindowBlur);
    drag.items.forEach((item) => {
      item.style.transform = '';
      item.classList.remove(this.host.draggingClass);
    });
    return drag;
  }

  private settle(saved: boolean): void {
    if (!this._disposed) this.host.settle(saved);
  }

  // The item whose handle a keyboard or pointer event started on (their targets are elements).
  private handleId(target: EventTarget | null): string | null {
    const handle = (target as Element).closest(this.host.handleSelector);
    return handle?.closest<HTMLElement>(`[data-${this.host.idAttribute}]`)?.dataset[dataKey(this.host.idAttribute)] ?? null;
  }

  private focusHandle(id: string): void {
    this.host.root.querySelector<HTMLElement>(`${byData(this.host.idAttribute, id)} ${this.host.handleSelector}`)?.focus();
  }
}

// `todo-id` → `todoId`, its key in an element's dataset.
function dataKey(attribute: string): string {
  return attribute.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
