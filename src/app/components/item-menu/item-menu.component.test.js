import { ItemMenuComponent } from '#root/dist/src/app/components/item-menu/item-menu.component.js';

describe('ItemMenuComponent', () => {
  let menu;
  let picked;

  const mount = () => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    menu = new ItemMenuComponent(placeholder, {
      id: 'note-1',
      name: 'Groceries',
      actions: [{ value: 'move', label: 'Move to this site' }, { value: 'copy', label: 'Copy' }],
      onAction: (action) => picked.push(action),
    });
    menu.render();
  };

  beforeEach(() => {
    picked = [];
    mount();
  });

  afterEach(() => {
    menu?.destroy();
    document.getElementById('app').innerHTML = '';
  });

  it('names its trigger after the item, and anchors the menu to it', () => {
    expect($('.item-menu__trigger').getAttribute('aria-label')).toBe('More actions for: Groceries');
    expect(document.getElementById('note-1-menu').getAttribute('anchor')).toBe('note-1-more');
  });

  it('hands over the action picked', () => {
    document.getElementById('note-1-menu').querySelector('[data-action="copy"]').click();
    expect(picked).toEqual(['copy']);
  });

  it('takes its menu away when destroyed, wherever the overlay moved', () => {
    menu.destroy();
    menu = null;
    expect(document.getElementById('note-1-menu')).toBe(null);
  });
});
