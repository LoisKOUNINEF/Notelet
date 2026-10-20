import { Component, html } from '../../../core/index.js';
import { delegateActions, removeOverlays } from '../../lib/overlays.js';

export interface IMenuAction<A extends string> {
  value: A;
  label: string;
}

export interface IItemMenuConfig<A extends string> {
  // The item's id prefix (`note-<id>`): the trigger is `<id>-more`, the menu `<id>-menu`.
  id: string;
  // How the trigger names its item ("More actions for: <name>").
  name: string;
  actions: IMenuAction<A>[];
  onAction: (action: A) => void;
}

interface IItemMenuView {
  id: string;
  name: string;
  actions: IMenuAction<string>[];
}

const templateFn = ({ id, name, actions }: IItemMenuView) => html`__TEMPLATE_PLACEHOLDER__`;

/**
 * A note's or a to-do's "⋯" button and the menu it opens. The menu is an a11y-elements overlay,
 * which moves itself to <body>: this component removes it on every render and when destroyed, and
 * delegates its clicks (see lib/overlays.ts).
 */
export class ItemMenuComponent<A extends string> extends Component<HTMLElement, IItemMenuView> {
  private readonly _id: string;
  private readonly _actions: A[];
  private readonly _onAction: (action: A) => void;

  constructor(mountTarget: HTMLElement, { id, name, actions, onAction }: IItemMenuConfig<A>) {
    super({ templateFn, mountTarget, tagName: 'span', props: { className: 'item-menu' }, config: { id, name, actions } });
    this._id = id;
    this._actions = actions.map((action) => action.value);
    this._onAction = onAction;
  }

  protected override onBeforeRender(): void {
    removeOverlays(this.element, '.item-menu__overlays');
    super.onBeforeRender();
  }

  protected override onAfterRender(): void {
    super.onAfterRender();
    const menu = delegateActions(`${this._id}-menu`, (action) => {
      const picked = this._actions.find((value) => value === action);
      if (picked) this._onAction(picked);
    });
    if (menu) this.eventListeners.push(menu);
  }

  protected override onBeforeDestroy(): void {
    removeOverlays(this.element, '.item-menu__overlays');
    super.onBeforeDestroy();
  }
}
