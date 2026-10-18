import { Component, html } from '../../../core/index.js';

export interface IScopeTabsConfig {
  active: NoteScope;
  counts: Record<NoteScope, number>;
  // The id of the tab panel both tabs control.
  panelId: string;
  onSelect: (scope: NoteScope) => void;
}

interface IScopeTab {
  scope: NoteScope;
  label: string;
  count: number;
  selected: boolean;
}

interface IScopeTabsView {
  tabs: IScopeTab[];
  panelId: string;
}

const templateFn = ({ tabs, panelId }: IScopeTabsView) => html`__TEMPLATE_PLACEHOLDER__`;

const SCOPES: NoteScope[] = ['page', 'site'];
const LABELS: Record<NoteScope, string> = { page: 'This page', site: 'This site' };

/**
 * "This page" / "This site" tabs (WAI-ARIA tabs pattern, automatic activation):
 * one Tab stop, ←/→ (and Home/End) move between tabs and show their notes at once.
 */
export class ScopeTabsComponent extends Component<HTMLElement, IScopeTabsView> {
  private _active: NoteScope;
  private _onSelect: (scope: NoteScope) => void;

  constructor(mountTarget: HTMLElement, { active, counts, panelId, onSelect }: IScopeTabsConfig) {
    super({
      templateFn,
      mountTarget,
      config: {
        panelId,
        tabs: SCOPES.map((scope) => ({ scope, label: LABELS[scope], count: counts[scope], selected: scope === active })),
      },
    });
    this._active = active;
    this._onSelect = onSelect;
  }

  private _select(scope: string): void {
    if (isScope(scope) && scope !== this._active) this._onSelect(scope);
  }

  private _onKeydown(event: KeyboardEvent): void {
    const index = SCOPES.indexOf(this._active);
    const next: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: SCOPES.length - 1,
    };
    if (!(event.key in next)) return;

    event.preventDefault();
    // Wraps around at both ends.
    const target = SCOPES[(next[event.key]! + SCOPES.length) % SCOPES.length]!;
    this._select(target);
  }
}

function isScope(value: string): value is NoteScope {
  return (SCOPES as string[]).includes(value);
}
