import { notifierService } from '#root/dist/src/app/services/notifier/notifier.service.js';

// a11y-elements' snackbar isn't upgraded in jsdom: these check what the service hands to notify().
describe('NotifierService', () => {
  let notify;

  beforeEach(() => {
    notify = spyOn(notifierService, '_notify').andCallFake(() => {});
  });

  afterEach(() => notify.restore());

  it('shows info and success toasts', () => {
    notifierService.info('Hello.');
    notifierService.success('Saved.');
    expect(notify.calls).toEqual([
      ['Hello.', { type: 'info' }],
      ['Saved.', { type: 'success' }],
    ]);
  });

  it('shows errors longer, as alerts', () => {
    notifierService.error('Nope.');
    expect(notify.lastCall).toEqual(['Nope.', { type: 'error', duration: 6000 }]);
  });

  it('adds an action button', () => {
    let undone = false;
    notifierService.info('Note deleted.', { label: 'Undo', run: () => { undone = true; } });

    const [, options] = notify.lastCall;
    expect(options.actionText).toBe('Undo');
    options.onAction();
    expect(undone).toBe(true);
  });

  it('offers to undo, and reports an undo that fails', async () => {
    let undone = 0;
    notifierService.undoable('To-do deleted.', async () => { undone++; }, 'Couldn\'t restore the to-do.');
    const [message, options] = notify.lastCall;
    expect(message).toBe('To-do deleted.');
    expect(options.type).toBe('info');
    expect(options.actionText).toBe('Undo');
    options.onAction();
    await flushPromises();
    expect(undone).toBe(1);

    notifierService.undoable('Marked as done.', async () => { throw new Error('Quota exceeded.'); }, 'Couldn\'t update the to-do.', 'success');
    expect(notify.lastCall[1].type).toBe('success');
    notify.lastCall[1].onAction();
    await flushPromises();
    expect(notify.lastCall).toEqual(['Couldn\'t update the to-do. Quota exceeded.', { type: 'error', duration: 6000 }]);
  });
});
