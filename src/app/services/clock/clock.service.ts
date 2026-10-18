import { AppEventBus, Service } from '../../../core/index.js';

const MINUTE = 60_000;

/**
 * Emits `minute-tick` once a minute while the panel is open, so relative times ("5 minutes ago")
 * stay true without anything re-rendering. One interval for the whole panel.
 */
export class ClockService extends Service<ClockService> {
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
  }

  public start(): void {
    if (this._timer) return;
    this._timer = setInterval(() => AppEventBus.emit('minute-tick'), MINUTE);
    this.registerCleanup(() => this.stop());
  }

  public stop(): void {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}

export const clockService = ClockService.getInstance();
