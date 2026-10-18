import { announce } from '../../lib/announce.js';
import { byData } from '../../lib/focus.js';
import { moveId, targetIndex } from '../../lib/reorder.js';

// What the to-do list gives the reorder gestures to work with.
export interface IReorderHost {
  // The list's own element: handle events are delegated to it.
  root: HTMLElement;
  // The open to-dos' ids, in the order shown.
  openIds(): string[];
  textOf(id: string): string;
  // Shows `order` (null: the stored one) with `grabbedId` picked up, focus back on its handle.
  preview(order: string[] | null, grabbedId: string | null): void;
  // Saves the new order (resolves to whether it was saved); focus ends on the moved to-do's handle.
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

const OPEN_LIST = '[data-catalog="open-todos"]';
const HANDLE = '.todo-item__handle';
const DRAGGING = 'todo-list__item--dragging';

/**
 * Reordering the open to-dos by their grab handles:
 * - keyboard: Space/Enter picks up, ↑/↓/Home/End move, Space/Enter or Tab drops, Escape cancels,
 *   each step announced;
 * - pointer (mouse, pen, touch): drag the handle, the others slide aside, release to drop.
 */
export class TodoReorder {
  private _grab: IKeyboardGrab | null = null;
  private _drag: IPointerDrag | null = null;
  // Set while preview() re-renders: the handle losing focus then isn't a drop.
  private _previewing = false;
  // While dragging: the panel losing focus (another window, an OS gesture) cancels the drag.
  private readonly _onWindowBlur = () => this.endDrag(false);

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
    const id = handleId(event.target);
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

  // Tabbing away (or clicking elsewhere) drops the to-do where it is. The re-renders that move
  // the handle itself happen while previewing.
  private onFocusout(): void {
    if (!this._grab || this._previewing) return;
    void this.drop();
  }

  private pickUp(id: string): void {
    const order = this.host.openIds();
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
      this.host.settle(false);
      return;
    }
    announce(`Dropped ${text} at position ${order.indexOf(id) + 1} of ${order.length}.`);
    this.host.settle(await this.host.commit(order, id));
  }

  private cancel(): void {
    const { id } = this._grab!;
    this._grab = null;
    this.preview(id);
    announce('Reorder cancelled.');
    this.host.settle(false);
  }

  // Re-renders the list with the current grab (if any), focus back on `focusId`'s handle.
  private preview(focusId: string): void {
    this._previewing = true;
    try {
      this.host.preview(this.previewOrder, this.grabbedId);
      focusHandle(this.host.root, focusId);
    } finally {
      this._previewing = false;
    }
  }

  private onPointerdown(event: PointerEvent): void {
    const id = handleId(event.target);
    if (!id || this._grab || !event.isPrimary || event.button > 0) return;
    const handle = event.target as HTMLElement;
    const items = Array.from(this.host.root.querySelector(OPEN_LIST)!.children) as HTMLElement[];
    const from = items.findIndex((item) => item.contains(handle));
    const rects = items.map((item) => item.getBoundingClientRect());

    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    items[from]!.classList.add(DRAGGING);
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
      // The ones the dragged to-do passed make room for it, the others stay.
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
    const drag = this._drag;
    if (!drag) return;
    this._drag = null;
    window.removeEventListener('blur', this._onWindowBlur);
    drag.items.forEach((item) => {
      item.style.transform = '';
      item.classList.remove(DRAGGING);
    });

    const order = this.host.openIds();
    if (keep && drag.to !== drag.from) {
      const next = moveId(order, drag.id, drag.to);
      announce(`Moved ${this.host.textOf(drag.id)} to position ${drag.to + 1} of ${order.length}.`);
      void this.host.commit(next, drag.id).then((saved) => this.host.settle(saved));
      return;
    }
    focusHandle(this.host.root, drag.id);
    this.host.settle(false);
  }
}

// The to-do whose handle a keyboard or pointer event started on (their targets are elements).
function handleId(target: EventTarget | null): string | null {
  const handle = (target as Element).closest(HANDLE);
  return handle?.closest<HTMLElement>('[data-todo-id]')?.dataset.todoId ?? null;
}

function focusHandle(root: HTMLElement, id: string): void {
  root.querySelector<HTMLElement>(`${byData('todo-id', id)} ${HANDLE}`)?.focus();
}
