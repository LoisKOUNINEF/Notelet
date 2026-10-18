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
});
