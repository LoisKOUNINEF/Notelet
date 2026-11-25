import { hasRequestedFocus } from '#root/dist/src/app/lib/focus.js';
import { TodoComposerComponent } from '#root/dist/src/app/components/todo-composer/todo-composer.component.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, keydown, settle, startPanel, typeInto } from '../../testing/panel.js';
import { refusesBlank } from '../../testing/fields.js';

describe('TodoComposerComponent', () => {
  let panel;
  let composer;

  const mount = (scope) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    composer = new TodoComposerComponent(placeholder, { scope, key: KEYS[scope] });
    composer.render();
  };
  const input = () => $('.todo-composer__input');
  // Enter in a one-field form submits it.
  const submit = async () => {
    $('.todo-composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };
  const stored = async (scope) => (await scopeStoreService.load(KEYS))[scope].todos.map((t) => t.text);

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    composer.destroy();
    await panel.stop();
  });

  it('labels the field with its scope, and names its button', () => {
    mount('site');
    expect($('a11y-label').textContent).toBe('New to-do for this site');
    expect(input().getAttribute('placeholder')).toBe('Write a to-do…');
    expect($('.todo-composer__submit').textContent).toBe('Add to-do');
  });

  it('asks for text like the note composer, and says Enter adds', () => {
    mount('page');
    expect(refusesBlank(input())).toBe(true);
    expect($('.todo-composer__hint').textContent).toBe('Enter to add');
    expect($('.todo-composer__hint').getAttribute('aria-hidden')).toBe('true');
  });

  it('adds the trimmed to-do to its scope and clears the field', async () => {
    mount('site');
    typeInto(input(), '  Renew the certificate  ');
    await submit();

    expect(await stored('site')).toEqual(['Renew the certificate']);
    expect(input().value).toBe('');
  });

  it('adds it with Enter, as a one-line field that wraps', async () => {
    mount('page');
    expect(input().tagName).toBe('TEXTAREA');
    expect(input().rows).toBe(1);
    typeInto(input(), 'Renew the certificate');
    keydown(input(), 'Enter');
    await settle();
    expect(await stored('page')).toEqual(['Renew the certificate']);
  });

  it('ignores an empty or blank to-do', async () => {
    mount('page');
    typeInto(input(), '   ');
    await submit();
    expect(await stored('page')).toEqual([]);
  });

  it('gives the text back and explains when the to-do can\'t be saved', async () => {
    mount('page');
    typeInto(input(), 'Keep me');
    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    await submit();

    expect(input().value).toBe('Keep me');
    expect(panel.toasts.at(-1)).toEqual({ message: 'Couldn\'t add to-do “Keep me”. Quota exceeded.', type: 'error', duration: 6000 });
    // Nothing left asking for the focus: a later re-render won't pull it back to this field.
    expect(hasRequestedFocus()).toBe(false);
  });

  it('starts from the text left on the same scope and page, apart from the note composer\'s', () => {
    mount('page');
    typeInto(input(), 'Unsent');
    composer.destroy();

    mount('page');
    expect(input().value).toBe('Unsent');
    typeInto(input(), '');
  });

});

describe('TodoComposerComponent - checklists', () => {
  let panel;
  let composer;

  const mount = (scope = 'page') => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    composer = new TodoComposerComponent(placeholder, { scope, key: KEYS[scope] });
    composer.render();
  };
  const input = () => $('.todo-composer__input');
  const checklistButton = () => $('.todo-composer__checklist');
  const fields = () => $$('.checklist-field__input');
  const values = () => fields().map((f) => f.value);
  const submit = async () => {
    $('.todo-composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };
  const todos = async () => (await scopeStoreService.load(KEYS)).page.todos;

  beforeEach(async () => {
    panel = await startPanel();
  });

  afterEach(async () => {
    composer.destroy();
    await panel.stop();
  });

  it('turns into a checklist with "Checklist": the field names it, a first item is focused', () => {
    mount();
    expect(checklistButton().textContent).toBe('Checklist');
    typeInto(input(), 'Groceries');
    checklistButton().click();

    expect($('a11y-label').textContent).toBe('New checklist for this page');
    expect(input().getAttribute('placeholder')).toBe('Checklist name…');
    expect(input().value).toBe('Groceries');
    expect(fields().length).toBe(1);
    expect(document.activeElement).toBe(fields()[0]);
    expect(checklistButton().textContent).toBe('Add item');
    expect($('.todo-composer__hint').textContent).toBe('Ctrl+Enter to add');
    expect($('.todo-composer__submit').textContent).toBe('Add checklist');
  });

  it('adds the next item with Enter, and goes back to a single to-do once the last item is removed', () => {
    mount();
    typeInto(input(), 'Groceries');
    checklistButton().click();
    fields()[0].value = 'Milk';
    keydown(fields()[0], 'Enter');
    expect(values()).toEqual(['Milk', '']);
    expect(document.activeElement).toBe(fields()[1]);

    $$('.checklist-field__remove')[1].click();
    $$('.checklist-field__remove')[0].click();
    expect(fields()).toEqual([]);
    expect(checklistButton().textContent).toBe('Checklist');
    expect($('a11y-label').textContent).toBe('New to-do for this page');
    expect(document.activeElement).toBe(checklistButton());
  });

  it('adds a checklist with its items, empty ones dropped, then starts afresh', async () => {
    mount();
    typeInto(input(), '  Groceries ');
    checklistButton().click();
    fields()[0].value = ' Milk ';
    checklistButton().click();
    checklistButton().click();
    fields()[2].value = 'Eggs';
    keydown(input(), 'Enter', { ctrlKey: true });
    await settle();

    const [list] = await todos();
    expect(list.text).toBe('Groceries');
    expect(list.items.map((i) => [i.text, i.done])).toEqual([['Milk', false], ['Eggs', false]]);
    expect(fields()).toEqual([]);
    expect(input().value).toBe('');
    expect(checklistButton().textContent).toBe('Checklist');
  });

  it('adds a checklist once with Ctrl+Enter from an item, and with Enter from its name', async () => {
    mount();
    typeInto(input(), 'Groceries');
    checklistButton().click();
    fields()[0].value = 'Milk';
    keydown(fields()[0], 'Enter', { ctrlKey: true });
    await settle();
    expect((await todos()).map((t) => [t.text, t.items.length])).toEqual([['Groceries', 1]]);

    typeInto(input(), 'Trip');
    checklistButton().click();
    fields()[0].value = 'Passport';
    keydown(input(), 'Enter');
    await settle();
    expect((await todos()).map((t) => t.text).sort()).toEqual(['Groceries', 'Trip']);
  });

  it('adds a single to-do when every item was left empty', async () => {
    mount();
    typeInto(input(), 'Just this');
    checklistButton().click();
    await submit();
    const [todo] = await todos();
    expect(todo.text).toBe('Just this');
    expect('items' in todo).toBe(false);
  });

  it('keeps the items being written as a draft, and gives everything back when adding fails', async () => {
    mount();
    typeInto(input(), 'Trip');
    checklistButton().click();
    fields()[0].value = 'Passport';
    composer.destroy();
    mount();
    expect(input().value).toBe('Trip');
    expect(values()).toEqual(['Passport']);
    expect(checklistButton().textContent).toBe('Add item');

    panel.fake.storage.local.failNextSet = new Error('Quota exceeded.');
    await submit();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t add checklist “Trip”. Quota exceeded.');
    expect(input().value).toBe('Trip');
    expect(values()).toEqual(['Passport']);
    expect(hasRequestedFocus()).toBe(false);
  });

  it('goes back to the name with Escape from an item', () => {
    mount();
    typeInto(input(), 'Groceries');
    checklistButton().click();
    keydown(fields()[0], 'Escape');
    expect(document.activeElement).toBe(input());
  });

  it('keeps the focus on an empty name with "List" or "Add item", the item field added all the same', () => {
    mount();
    checklistButton().click();
    expect(input().getAttribute('placeholder')).toBe('Checklist name…');
    expect(fields().length).toBe(1);
    expect(document.activeElement).toBe(input());

    checklistButton().click();
    expect(fields().length).toBe(2);
    expect(document.activeElement).toBe(input());

    typeInto(input(), 'Groceries');
    checklistButton().click();
    expect(document.activeElement).toBe(fields()[2]);
  });

  it('offers no "Take out" on its items (only the to-do editor does)', () => {
    mount();
    checklistButton().click();
    expect(fields().length).toBe(1);
    expect($('.checklist-field__take-out')).toBeFalsy();
    expect($('.checklist-field__remove')).toBeTruthy();
  });

  it('is disabled while the list is selecting, its checklist\'s fields too, through a checklist toggle', async () => {
    mount('page');
    typeInto(input(), 'Groceries');
    $('.todo-composer__checklist').click();
    composer.setSelecting(true);
    expect($('.todo-composer__fieldset').disabled).toBe(true);
    expect($('.todo-composer__hint').textContent).toBe('Finish or cancel the selection to add a to-do');
    expect($('.todo-composer__hint').getAttribute('aria-hidden')).toBe(null);
    expect(input().value).toBe('Groceries');
    expect(fields()[0].matches(':disabled')).toBe(true);
    expect(checklistButton().matches(':disabled')).toBe(true);

    await submit();
    expect(await todos()).toEqual([]);

    composer.setSelecting(false);
    expect($('.todo-composer__fieldset').disabled).toBe(false);
    expect($('.todo-composer__hint').getAttribute('aria-hidden')).toBe('true');
    expect(fields()[0].matches(':disabled')).toBe(false);
    await submit();
    expect((await todos()).map((t) => t.text)).toEqual(['Groceries']);
  });

  it('stays disabled when re-rendered meanwhile, and says Enter adds once back', () => {
    mount('page');
    composer.setSelecting(true);
    composer.render();
    expect($('.todo-composer__fieldset').disabled).toBe(true);
    composer.setSelecting(false);
    expect($('.todo-composer__hint').textContent).toBe('Enter to add');
  });
});
