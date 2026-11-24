import { TodoEditorComponent } from '#root/dist/src/app/components/todo-editor/todo-editor.component.js';
import { clearDrafts, getEditDraft, setEditDraft } from '#root/dist/src/app/lib/drafts.js';
import { keydown, spoken } from '../../testing/panel.js';
import { refusesBlank } from '../../testing/fields.js';

// On its own, with recording callbacks: the to-do item's tests cover it in the panel.
describe('TodoEditorComponent', () => {
  let editor;
  let calls;

  const single = { id: 't1', text: 'Call back', done: false };
  const list = {
    id: 't2',
    text: 'Groceries',
    done: false,
    items: [{ id: 'a', text: 'Milk', done: true }, { id: 'b', text: 'Eggs', done: false }],
  };

  const mount = (todo, draft) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    editor = new TodoEditorComponent(placeholder, {
      todo,
      draft,
      onSave: (text, items, takenOut) => calls.push(['save', text, items, takenOut]),
      onCancel: () => calls.push(['cancel']),
    });
    editor.render();
  };
  const destroy = () => {
    editor.destroy();
    editor = null;
  };
  const input = () => $('.todo-editor__input');
  const label = () => $('.todo-editor__field a11y-label').textContent;
  const fields = () => $$('.checklist-field__input');
  const values = () => fields().map((f) => f.value);
  const submit = () => $('.todo-editor__form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  beforeEach(() => {
    calls = [];
    clearDrafts();
    useFakeTimers();
  });

  afterEach(() => {
    editor?.destroy();
    useRealTimers();
    document.getElementById('app').innerHTML = '';
    document.getElementById('app-announcer')?.remove();
    clearDrafts();
  });

  it('shows a single to-do by its name, with no items', () => {
    mount(single);
    expect(input().value).toBe('Call back');
    expect(label()).toBe('To-do');
    expect(refusesBlank(input())).toBe(true);
    expect(fields()).toEqual([]);
    expect($('.todo-editor__restored')).toBeFalsy();
    expect($('.todo-editor__taken-out')).toBeFalsy();
    expect($$('.todo-editor button').map((b) => b.textContent)).toEqual(['Add item', 'Save', 'Cancel']);
  });

  it('shows a checklist by its name, with one field per item', () => {
    mount(list);
    expect(input().value).toBe('Groceries');
    expect(label()).toBe('Checklist name');
    expect(values()).toEqual(['Milk', 'Eggs']);
  });

  it('names a checklist or a single to-do as items are added and removed, keeping the typed name', () => {
    mount(single);
    input().value = 'Call back Sam';
    $('.todo-editor__add-item').click();
    expect(label()).toBe('Checklist name');
    expect(fields().length).toBe(1);
    expect(document.activeElement).toBe(fields()[0]);
    expect(input().value).toBe('Call back Sam');

    $('.checklist-field__remove').click();
    expect(label()).toBe('To-do');
    expect(document.activeElement).toBe($('.todo-editor__add-item'));
    expect(input().value).toBe('Call back Sam');
  });

  it('saves the trimmed name and items, dropping the empty ones, checked items still checked', () => {
    mount(list);
    input().value = '  Shopping ';
    fields()[0].value = '  Oat milk ';
    fields()[1].value = '   ';
    $('.todo-editor__add-item').click();
    submit();
    expect(calls).toEqual([['save', 'Shopping', [{ id: 'a', text: 'Oat milk', done: true }], []]]);
  });

  it('saves with Enter in the name, or Ctrl+Enter in an item (Enter there adds the next one)', () => {
    mount(list);
    expect(input().tagName).toBe('TEXTAREA');
    input().value = 'Shopping';
    keydown(input(), 'Enter');
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toBe('Shopping');

    keydown(fields()[0], 'Enter');
    expect(fields().length).toBe(3);
    expect(calls.length).toBe(1);
    keydown(fields()[0], 'Enter', { metaKey: true });
    expect(calls.length).toBe(2);
  });

  it('refuses to save a blank name', () => {
    mount(list);
    input().value = '   ';
    submit();
    expect(calls).toEqual([]);
  });

  it('cancels with Cancel, or Escape in the name or an item, Escape going no further', () => {
    mount(list);
    const reached = [];
    document.getElementById('app').addEventListener('keydown', (event) => reached.push(event.key));

    $('.todo-editor__cancel').click();
    keydown(input(), 'Escape');
    keydown(fields()[0], 'Escape');
    expect(calls).toEqual([['cancel'], ['cancel'], ['cancel']]);
    expect(reached).toEqual([]);

    keydown(input(), 'a');
    expect(calls.length).toBe(3);
    expect(reached).toEqual(['a']);
  });

  it('saves with Ctrl+Enter and cancels with Escape from its buttons too', () => {
    mount(list);
    keydown($('.todo-editor__add-item'), 'Enter', { ctrlKey: true });
    keydown($('.todo-editor__cancel'), 'Escape');
    expect(calls.map(([kind]) => kind)).toEqual(['save', 'cancel']);
  });

  it('says how to save: Enter for a single to-do, Ctrl+Enter once it has items', () => {
    mount(single);
    expect($('.todo-editor__hint').textContent).toBe('Enter to save · Esc to cancel');
    $('.todo-editor__add-item').click();
    expect($('.todo-editor__hint').textContent).toBe('Ctrl+Enter to save · Esc to cancel');
  });

  it('shows ⌘ instead of Ctrl on macOS', () => {
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
    try {
      mount(list);
      expect($('.todo-editor__hint').textContent).toBe('⌘+Enter to save · Esc to cancel');
    } finally {
      delete window.navigator.platform;
    }
  });

  it('takes items out, to be saved as single to-dos, and puts them back at the end', () => {
    mount(list);
    $$('.checklist-field__take-out')[0].click();
    expect(values()).toEqual(['Eggs']);
    expect($$('.todo-editor__taken-out-text').map((t) => t.textContent)).toEqual(['Milk']);
    expect($('.todo-editor__put-back').getAttribute('aria-label')).toBe('Put back Milk');

    submit();
    expect(calls).toEqual([['save', 'Groceries', [list.items[1]], [list.items[0]]]]);

    $('.todo-editor__put-back').click();
    expect(values()).toEqual(['Eggs', 'Milk']);
    expect(document.activeElement).toBe(fields()[1]);
    expect($('.todo-editor__taken-out')).toBeFalsy();
  });

  it('keeps an unsaved edit as a draft when it goes away', () => {
    mount(list);
    input().value = 'Shopping';
    fields()[1].value = 'Bread';
    $$('.checklist-field__take-out')[0].click();
    destroy();
    expect(getEditDraft('todo', 't2')).toEqual({
      text: 'Shopping',
      items: [{ id: 'b', text: 'Bread', done: false }],
      takenOut: [list.items[0]],
    });
  });

  it('leaves no draft when nothing was changed', () => {
    setEditDraft('todo', 't2', { text: 'Stale', items: [] });
    mount(list);
    destroy();
    expect(getEditDraft('todo', 't2')).toBe(null);
  });

  it('leaves no draft once closed, and keeps one again once reopened', () => {
    setEditDraft('todo', 't2', { text: 'Stale', items: [] });
    mount(list);
    input().value = 'Shopping';
    editor.close();
    expect(getEditDraft('todo', 't2')).toBe(null);

    editor.reopen();
    destroy();
    expect(getEditDraft('todo', 't2').text).toBe('Shopping');

    mount(list);
    input().value = 'Shopping';
    editor.close();
    destroy();
    expect(getEditDraft('todo', 't2')).toBe(null);
  });

  it('starts from a draft, saying so once', async () => {
    mount(list, { text: 'Shopping', items: [{ id: 'b', text: 'Bread', done: false }], takenOut: [list.items[0]] });
    expect(input().value).toBe('Shopping');
    expect(values()).toEqual(['Bread']);
    expect($$('.todo-editor__taken-out-text').map((t) => t.textContent)).toEqual(['Milk']);
    expect($('.todo-editor__restored').textContent).toBe('Unsaved changes restored.');
    expect(await spoken()).toBe('Unsaved changes restored.');

    // A re-render doesn't announce it again (announce() would clear the region first).
    $('.todo-editor__add-item').click();
    expect(await spoken()).toBe('Unsaved changes restored.');
  });

  it('focuses an item\'s field, or the name when it\'s not given or not there, caret at the end', () => {
    mount(list);
    editor.focus('b');
    expect(document.activeElement).toBe(fields()[1]);
    expect(fields()[1].selectionStart).toBe('Eggs'.length);

    editor.focus();
    expect(document.activeElement).toBe(input());
    expect(input().selectionStart).toBe('Groceries'.length);

    fields()[0].focus();
    editor.focus('missing');
    expect(document.activeElement).toBe(input());
  });
});
