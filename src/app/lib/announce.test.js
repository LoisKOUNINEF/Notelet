import { announce } from '#root/dist/src/app/lib/announce.js';

describe('announce', () => {
  const region = () => document.getElementById('app-announcer');
  const later = () => advanceTimersByTime(50);

  beforeEach(() => useFakeTimers());
  afterEach(() => {
    useRealTimers();
    region()?.remove();
  });

  it('reads messages out through one polite, visually hidden live region', async () => {
    announce('Picked up Milk.');
    await later();
    announce('Moved to position 2 of 3.');
    await later();

    expect($$('#app-announcer').length).toBe(1);
    expect(region().getAttribute('aria-live')).toBe('polite');
    expect(region().getAttribute('aria-atomic')).toBe('true');
    expect(region().classList.contains('a11y-visually-hidden')).toBe(true);
    expect(region().textContent).toBe('Moved to position 2 of 3.');
  });

  it('clears the region first, so a repeated message is read again', async () => {
    announce('Same');
    await later();
    announce('Same');
    expect(region().textContent).toBe('');
    await later();
    expect(region().textContent).toBe('Same');
  });
});
