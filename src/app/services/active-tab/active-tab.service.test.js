import { activeTabService } from '#root/dist/src/app/services/active-tab/active-tab.service.js';
import { AppEventBus } from '#root/dist/src/core/index.js';
import { installFakeChrome, uninstallFakeChrome } from '../../testing/fake-chrome.js';

describe('ActiveTabService', () => {
  let fake;
  let events;
  const onScope = ({ keys }) => events.push(keys);

  beforeEach(async () => {
    fake = installFakeChrome({ url: 'https://example.com/a' });
    events = [];
    AppEventBus.subscribe('active-scope-changed', onScope);
    await activeTabService.init();
  });

  afterEach(() => {
    AppEventBus.off('active-scope-changed', onScope);
    activeTabService.dispose();
    uninstallFakeChrome();
  });

  it('starts with the active tab\'s keys', () => {
    expect(activeTabService.keys.page).toBe('https://example.com/a');
    expect(activeTabService.keys.site).toBe('example.com');
  });

  it('follows a tab switch', async () => {
    fake.activateTab('https://other.org/b');
    await flushPromises();

    expect(activeTabService.keys.site).toBe('other.org');
    expect(events.map((k) => k.page)).toEqual(['https://example.com/a', 'https://other.org/b']);
  });

  it('follows a navigation in the same tab', async () => {
    fake.navigate('https://example.com/c');
    await flushPromises();
    expect(activeTabService.keys.page).toBe('https://example.com/c');
  });

  it('does not emit when the page stays the same (hash change)', async () => {
    fake.navigate('https://example.com/a#top');
    await flushPromises();
    expect(events.length).toBe(1);
  });

  it('has no keys on pages that can\'t have notes', async () => {
    fake.activateTab('chrome://extensions');
    await flushPromises();

    expect(activeTabService.keys).toBe(null);
    expect(events[events.length - 1]).toBe(null);
  });

  it('stops listening once disposed', () => {
    activeTabService.dispose();
    expect(fake.tabs.onActivated.hasListeners()).toBe(false);
    expect(fake.tabs.onUpdated.hasListeners()).toBe(false);
  });

  it('keeps the last keys when the tab can\'t be read', async () => {
    const query = spyOn(fake.tabs, 'query').andCallFake(async () => { throw new Error('Extension context invalidated.'); });
    fake.activateTab('https://other.org/b');
    await flushPromises();
    query.restore();
    expect(activeTabService.keys.page).toBe('https://example.com/a');
  });
});
