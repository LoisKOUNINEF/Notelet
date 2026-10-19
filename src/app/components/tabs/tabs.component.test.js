import { TabsComponent } from '#root/dist/src/app/components/tabs/tabs.component.js';
import { keydown } from '../../testing/panel.js';

describe('TabsComponent', () => {
  let tabs;
  let selected;

  const tab = (value, count = 0, countText = ', none') => ({ value, label: `Tab ${value}`, count, countText });
  const mount = (active, options = {}) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    tabs = new TabsComponent(placeholder, {
      tabs: [tab('page', 1, ', 1 note'), tab('site', 6, ', 4 notes, 2 to-dos')],
      active,
      idPrefix: 'scope-tab',
      label: 'Show notes for',
      panelId: 'panel',
      onSelect: (value) => selected.push(value),
      ...options,
    });
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
    mount('page');

    expect($('[role="tablist"]').getAttribute('aria-label')).toBe('Show notes for');
    const [page, site] = $$('[role="tab"]');
    expect(page.id).toBe('scope-tab-page');
    expect(page.getAttribute('aria-controls')).toBe('panel');
    expect(page.querySelector('.tabs__label').textContent).toBe('Tab page');
    expect(page.querySelector('.tabs__count').textContent).toBe('1');
    expect(page.querySelector('.tabs__count').getAttribute('aria-hidden')).toBe('true');
    expect(page.querySelector('.a11y-visually-hidden').textContent).toBe(', 1 note');
    expect(site.querySelector('.tabs__count').textContent).toBe('6');
    expect(site.querySelector('.a11y-visually-hidden').textContent).toBe(', 4 notes, 2 to-dos');
    expect($('.tabs').classList.contains('tabs--small')).toBe(false);
  });

  it('takes its ids from the prefix, and can be small', () => {
    mount('todos', { tabs: [tab('todos'), tab('notes')], idPrefix: 'kind-tab', small: true });
    expect($$('[role="tab"]').map((el) => el.id)).toEqual(['kind-tab-todos', 'kind-tab-notes']);
    expect($('.tabs').classList.contains('tabs--small')).toBe(true);
  });

  it('can be drawn as folder tabs, opening into what\'s below them', () => {
    mount('page');
    expect($('.tabs').classList.contains('tabs--folder')).toBe(false);
    tabs.destroy();
    mount('page', { folder: true });
    expect($('.tabs').classList.contains('tabs--folder')).toBe(true);
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
