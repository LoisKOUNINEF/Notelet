import { ChecklistFieldComponent } from '#root/dist/src/app/components/checklist-field/checklist-field.component.js';
import { keydown } from '../../testing/panel.js';

describe('ChecklistFieldComponent', () => {
  let field;
  let calls;

  beforeEach(() => {
    calls = [];
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    field = new ChecklistFieldComponent(placeholder, { id: 'a', text: 'Milk', done: false, index: 2 }, {
      onEnter: (id) => calls.push(['enter', id]),
      onRemove: (id) => calls.push(['remove', id]),
      onEscape: () => calls.push(['escape']),
    });
    field.render();
  });

  afterEach(() => {
    field.destroy();
    document.getElementById('app').innerHTML = '';
  });

  it('shows the item\'s text in a field numbered by its place', () => {
    expect($('.checklist-field__input').value).toBe('Milk');
    expect($('a11y-label').textContent).toBe('Item 3');
    expect($('.checklist-field__remove').getAttribute('aria-label')).toBe('Remove item 3');
    expect($('[data-item-id="a"]').classList.contains('checklist-field')).toBe(true);
  });

  it('asks for a new field on Enter, for its removal on Remove, and to cancel on Escape', () => {
    keydown($('.checklist-field__input'), 'Enter');
    $('.checklist-field__remove').click();
    keydown($('.checklist-field__input'), 'Escape');
    keydown($('.checklist-field__input'), 'Enter', { metaKey: true });
    expect(calls).toEqual([['enter', 'a'], ['remove', 'a'], ['escape']]);
  });
});
