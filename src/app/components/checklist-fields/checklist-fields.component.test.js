import { ChecklistFieldsComponent } from '#root/dist/src/app/components/checklist-fields/checklist-fields.component.js';
import { keydown } from '../../testing/panel.js';

describe('ChecklistFieldsComponent', () => {
  let list;
  let calls;

  const mount = (items = []) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    list = new ChecklistFieldsComponent(placeholder, {
      items,
      label: 'Checklist items',
      className: 'parent__items',
      onEscape: () => calls.push('escape'),
      onLastRemoved: () => calls.push('last-removed'),
      onChange: () => calls.push('change'),
    });
    list.render();
  };
  const fields = () => $$('.checklist-field__input');
  const values = () => fields().map((f) => f.value);

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    list.destroy();
    document.getElementById('app').innerHTML = '';
  });

  it('renders nothing without items, and a labelled list with them', () => {
    mount();
    expect($('.checklist-fields')).toBeFalsy();
    expect(list.count).toBe(0);
    list.destroy();

    mount([{ id: 'a', text: 'Milk', done: true }]);
    expect($('.checklist-fields').classList.contains('parent__items')).toBe(true);
    expect($('.checklist-fields').getAttribute('aria-label')).toBe('Checklist items');
    expect(values()).toEqual(['Milk']);
  });

  it('adds a focused field at the end, keeping what was typed', () => {
    mount([{ id: 'a', text: 'Milk', done: false }]);
    fields()[0].value = 'Oat milk';
    list.add();

    expect(values()).toEqual(['Oat milk', '']);
    expect(document.activeElement).toBe(fields()[1]);
    expect(calls).toEqual(['change']);
  });

  it('inserts a field after the current one on Enter', () => {
    mount([{ id: 'a', text: 'A', done: false }, { id: 'b', text: 'B', done: false }]);
    keydown(fields()[0], 'Enter');
    expect(values()).toEqual(['A', '', 'B']);
    expect(document.activeElement).toBe(fields()[1]);
  });

  it('removes fields, focusing the previous one, then telling the parent', () => {
    mount([{ id: 'a', text: 'A', done: false }, { id: 'b', text: 'B', done: false }]);
    $$('.checklist-field__remove')[1].click();
    expect(document.activeElement).toBe(fields()[0]);
    expect(calls).toEqual(['change']);

    $$('.checklist-field__remove')[0].click();
    expect($('.checklist-fields')).toBeFalsy();
    expect(calls).toEqual(['change', 'change', 'last-removed']);
  });

  it('passes Escape on to the parent', () => {
    mount([{ id: 'a', text: 'A', done: true }]);
    keydown(fields()[0], 'Escape');
    expect(calls).toEqual(['escape']);
  });

  it('gives back the items as typed, empty ones and checked state included, and resets', () => {
    mount([{ id: 'a', text: 'A', done: true }]);
    list.add();
    fields()[0].value = 'A2';
    expect(list.values().map(({ text, done }) => [text, done])).toEqual([['A2', true], ['', false]]);

    list.reset([]);
    expect(list.values()).toEqual([]);
    expect($('.checklist-fields')).toBeFalsy();
  });
});
