import { ConfirmDialogComponent } from '#root/dist/src/app/components/confirm-dialog/confirm-dialog.component.js';
import { confirmService } from '#root/dist/src/app/services/confirm/confirm.service.js';

// jsdom doesn't upgrade <a11y-modal> (nor move it to <body>): its `open` is a plain property
// here, and closing it from outside (Escape, the backdrop, ×) is simulated with its close event.
describe('ConfirmDialogComponent', () => {
  let dialog;

  const options = { title: 'Delete all notes for this page?', message: '2 notes, checklists included.', confirmLabel: 'Delete all' };
  const modal = () => document.getElementById('confirm-dialog');
  const button = (name) => modal().querySelector(`.confirm-dialog__${name}`);
  const closeFromOutside = () => {
    modal().open = false;
    document.dispatchEvent(new window.CustomEvent('a11y-overlay-close', { detail: { name: 'a11y-modal' } }));
  };

  beforeEach(() => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    dialog = new ConfirmDialogComponent(placeholder);
    dialog.render();
  });

  afterEach(() => {
    dialog.destroy();
    document.getElementById('app').innerHTML = '';
  });

  it('is closed until asked', () => {
    expect(modal()).toBeTruthy();
    expect(modal().open).toBeFalsy();
  });

  it('opens with the question, its own confirm label, and the focus on Cancel', () => {
    void dialog.ask(options);
    expect(modal().open).toBe(true);
    expect(modal().querySelector('h2').textContent).toBe(options.title);
    expect(modal().querySelector('.confirm-dialog__message').textContent).toBe(options.message);
    expect(button('confirm').textContent).toBe('Delete all');
    expect(button('cancel').textContent).toBe('Cancel');
    expect(document.activeElement).toBe(button('cancel'));
  });

  it('answers yes on confirm, and closes', async () => {
    const answer = dialog.ask(options);
    button('confirm').click();
    expect(await answer).toBe(true);
    expect(modal().open).toBe(false);
  });

  it('answers no on Cancel, and closes', async () => {
    const answer = dialog.ask(options);
    button('cancel').click();
    expect(await answer).toBe(false);
    expect(modal().open).toBe(false);
  });

  it('answers no when closed any other way: Escape, a click outside, its ×', async () => {
    const answer = dialog.ask(options);
    closeFromOutside();
    expect(await answer).toBe(false);
  });

  it('ignores other overlays closing while it stays open', async () => {
    let answered = false;
    const answer = dialog.ask(options).then((value) => { answered = true; return value; });
    document.dispatchEvent(new window.CustomEvent('a11y-overlay-close', { detail: { name: 'a11y-dropdown' } }));
    await flushPromises();
    expect(answered).toBe(false);
    button('confirm').click();
    expect(await answer).toBe(true);
  });

  it('ignores clicks in the dialog outside its buttons', async () => {
    let answered = false;
    void dialog.ask(options).then(() => { answered = true; });
    modal().querySelector('h2').click();
    await flushPromises();
    expect(answered).toBe(false);
    expect(modal().open).toBe(true);
  });

  it('cancels a question still open when asked another one', async () => {
    const first = dialog.ask(options);
    const second = dialog.ask({ ...options, title: 'Second?' });
    expect(await first).toBe(false);
    expect(modal().querySelector('h2').textContent).toBe('Second?');
    button('confirm').click();
    expect(await second).toBe(true);
  });

  it('answers the confirm service, and cancels an open question when it goes away', async () => {
    const answer = confirmService.ask(options);
    expect(modal().open).toBe(true);
    dialog.destroy();
    expect(await answer).toBe(false);
    expect(await confirmService.ask(options)).toBe(false);
    // afterEach destroys it again: harmless.
  });
});
