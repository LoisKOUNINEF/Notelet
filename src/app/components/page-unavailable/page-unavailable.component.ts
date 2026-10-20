import { Component, html } from '../../../core/index.js';

const templateFn = () => html`__TEMPLATE_PLACEHOLDER__`;

// What the panel shows instead of notes on a page that can't have any (the browser's own pages,
// files...).
export class PageUnavailableComponent extends Component {
  constructor(mountTarget: HTMLElement) {
    super({ templateFn, mountTarget });
  }
}
