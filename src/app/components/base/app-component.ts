import { Component } from '../../../core/index.js';

/**
 * Nutin's Component, plus what the panel's components share: a render that async work finishing
 * later (a save, a load) can call safely, even once the component was destroyed.
 */
export abstract class AppComponent<E extends HTMLElement = HTMLElement, V = unknown> extends Component<E, V> {
  // Renders `view`, unless destroyed
  protected rerender(view: V): void {
    if (this.isDestroyed) return;
    this.config = view;
    this.render();
  }
}
