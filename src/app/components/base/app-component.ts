import { Component } from '../../../core/index.js';

/**
 * Nutin's Component, plus what the panel's components share: knowing they were destroyed, so
 * async work finishing later (a save, a load) doesn't render them again.
 */
export abstract class AppComponent<E extends HTMLElement = HTMLElement, V = unknown> extends Component<E, V> {
  protected destroyed = false;

  protected override onBeforeDestroy(): void {
    this.destroyed = true;
    super.onBeforeDestroy();
  }

  // Renders `view`, unless destroyed: a destroyed component would rebuild children that nothing
  // would then ever destroy.
  protected rerender(view: V): void {
    if (this.destroyed) return;
    this.config = view;
    this.render();
  }
}
