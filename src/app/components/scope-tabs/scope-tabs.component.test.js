import { ScopeTabsComponent } from '#root/dist/src/app/components/scope-tabs/scope-tabs.component.js';
import { keydown } from '../../testing/panel.js';

describe('ScopeTabsComponent', () => {
  let tabs;
  let selected;

  const none = { notes: 0, todos: 0 };
  const mount = (active, counts = { page: none, site: none }) => {
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
    mount('page', { page: { notes: 1, todos: 0 }, site: { notes: 4, todos: 2 } });

    expect($('[role="tablist"]').getAttribute('aria-label')).toBe('Show notes for');
    const [page, site] = $$('[role="tab"]');
    expect(page.getAttribute('aria-controls')).toBe('panel');
    expect(page.querySelector('.scope-tabs__label').textContent).toBe('This page');
    expect(page.querySelector('.scope-tabs__count').textContent).toBe('1');
    expect(page.querySelector('.a11y-visually-hidden').textContent).toBe(', 1 note');
    expect(site.querySelector('.scope-tabs__count').textContent).toBe('6');
    expect(site.querySelector('.a11y-visually-hidden').textContent).toBe(', 4 notes, 2 to-dos');
  });

  it('shows notes plus open to-dos as one number, read out in words', () => {
    mount('page', { page: { notes: 0, todos: 1 }, site: none });
    expect($('#scope-tab-page .scope-tabs__count').textContent).toBe('1');
    expect($('#scope-tab-page .scope-tabs__count').getAttribute('aria-hidden')).toBe('true');
    expect($('#scope-tab-page .a11y-visually-hidden').textContent).toBe(', 1 to-do');
    expect($('#scope-tab-site .a11y-visually-hidden').textContent).toBe(', no items');
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
