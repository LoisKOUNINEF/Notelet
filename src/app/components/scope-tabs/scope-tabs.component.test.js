import { ScopeTabsComponent } from '#root/dist/src/app/components/scope-tabs/scope-tabs.component.js';
import { keydown } from '../../testing/panel.js';

describe('ScopeTabsComponent', () => {
  let tabs;
  let selected;

  const mount = (active, counts = { page: 0, site: 0 }) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    tabs = new ScopeTabsComponent(placeholder, { active, counts, panelId: 'panel', onSelect: (scope) => selected.push(scope) });
    tabs.render();
  };

  beforeEach(() => {
    selected = [];
  });

  afterEach(() => {
    tabs.destroy();
    document.getElementById('app').innerHTML = '';
  });

  it('renders a labelled tablist whose tabs control the panel', () => {
    mount('page', { page: 1, site: 4 });

    expect($('[role="tablist"]').getAttribute('aria-label')).toBe('Show notes for');
    const [page, site] = $$('[role="tab"]');
    expect(page.getAttribute('aria-controls')).toBe('panel');
    expect(page.textContent.replace(/\s+/g, ' ').trim()).toBe('This page 1 note');
    expect(site.textContent.replace(/\s+/g, ' ').trim()).toBe('This site 4 notes');
  });

  it('marks the active tab as the only Tab stop', () => {
    mount('site');
    expect($('#scope-tab-site').getAttribute('aria-selected')).toBe('true');
    expect($('#scope-tab-site').tabIndex).toBe(0);
    expect($('#scope-tab-page').getAttribute('aria-selected')).toBe('false');
    expect($('#scope-tab-page').tabIndex).toBe(-1);
  });

  it('selects the other tab on click, not the active one', () => {
    mount('page');
    $('#scope-tab-page').click();
    $('#scope-tab-site').click();
    expect(selected).toEqual(['site']);
  });

  it('selects with arrows (wrapping), Home and End, and ignores other keys', () => {
    mount('page');
    keydown($('#scope-tab-page'), 'ArrowLeft');
    keydown($('#scope-tab-page'), 'ArrowRight');
    keydown($('#scope-tab-page'), 'End');
    keydown($('#scope-tab-page'), 'Home');
    keydown($('#scope-tab-page'), 'a');
    expect(selected).toEqual(['site', 'site', 'site']);
  });
});
