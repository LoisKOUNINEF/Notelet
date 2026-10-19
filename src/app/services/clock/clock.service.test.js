import { clockService } from '#root/dist/src/app/services/clock/clock.service.js';
import { useEventBus } from '#root/dist/src/core/index.js';
import { MockEventBus } from '#root/tools/testin-nutin/mocks/mock-event-bus.js';

// The app's events go through this mock (see useEventBus), a new one for each test.
let bus;

describe('ClockService', () => {
  let ticks;
  const onTick = () => ticks++;

  beforeEach(() => {
    bus = new MockEventBus();
    useEventBus(bus);
    ticks = 0;
    useFakeTimers();
    bus.subscribe('minute-tick', onTick);
  });

  afterEach(() => {
    useEventBus(null);
    clockService.dispose();
    useRealTimers();
  });

  it('ticks once a minute', () => {
    clockService.start();
    advanceTimersByTime(59_999);
    expect(ticks).toBe(0);
    advanceTimersByTime(1);
    expect(ticks).toBe(1);
    advanceTimersByTime(120_000);
    expect(ticks).toBe(3);
  });

  it('runs a single clock however often it\'s started', () => {
    clockService.start();
    clockService.start();
    advanceTimersByTime(60_000);
    expect(ticks).toBe(1);
  });

  it('stops, and stops when disposed', () => {
    clockService.start();
    clockService.stop();
    advanceTimersByTime(60_000);
    expect(ticks).toBe(0);

    clockService.start();
    clockService.dispose();
    advanceTimersByTime(60_000);
    expect(ticks).toBe(0);
  });
});
