import { SiteManagerComponent } from '#root/dist/src/app/components/site-manager/site-manager.component.js';
import { confirmService } from '#root/dist/src/app/services/confirm/confirm.service.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { settingsService } from '#root/dist/src/app/services/settings/settings.service.js';
import { deferred, KEYS, settle, startPanel } from '../../testing/panel.js';

const DAY = 24 * 60 * 60 * 1000;

describe('SiteManagerComponent', () => {
  let panel;
  let manager;
  let asked;
  let answer;
  let detach;
  let backs;

  const mount = async () => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    manager = new SiteManagerComponent(placeholder, { onBack: () => backs++ });
    manager.render();
    await settle();
  };
  // Adds an item last edited `days` ago.
  const addOld = async (days, add) => {
    const now = spyOn(Date, 'now').andReturn(Date.now() - days * DAY);
    try {
      return await add();
    } finally {
      now.restore();
    }
  };
  const sites = () => $$('.site-row__name').map((el) => el.textContent);
  const row = (site) => $$('.site-row').find((el) => el.querySelector('.site-row__name').textContent.startsWith(site));
  const pickOrder = (value) => {
    $('.site-manager__select').value = value;
    $('.site-manager__select').dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const keys = () => [...panel.fake.storage.local.data.keys()].filter((key) => key !== 'settings').sort();

  beforeEach(async () => {
    panel = await startPanel();
    asked = [];
    answer = true;
    backs = 0;
    detach = confirmService.attach({ ask: async (options) => { asked.push(options); return answer; } });
    // example.com (the active tab's site, edited 1 day ago), beta.org (10 days), alpha.net (3 days).
    await addOld(1, () => scopeStoreService.addNote('page', KEYS.page, 'Page note'));
    await addOld(5, () => scopeStoreService.addTodo('site', KEYS.site, 'Site to-do'));
    await addOld(10, () => scopeStoreService.addNote('page', 'https://beta.org/x', 'Beta'));
    await addOld(3, () => scopeStoreService.addTodo('page', 'https://alpha.net', 'Alpha'));
  });

  afterEach(async () => {
    detach();
    manager.destroy();
    await panel.stop();
  });

  it('lists each site with notes or to-dos, most recently edited first', async () => {
    await mount();
    expect($('#site-manager-title').textContent).toBe('Notes by site');
    expect($('.site-manager__list').getAttribute('aria-label')).toBe('Sites with notes or to-dos');
    expect(sites()).toEqual(['example.com (current)', 'alpha.net', 'beta.org']);
    expect(row('example.com').querySelector('.site-row__meta').textContent).toBe('1 note and 1 to-do · Edited yesterday');
  });

  it('sorts old to recent, A to Z and Z to A, and remembers the order picked', async () => {
    await mount();
    expect($$('.site-manager__select option').map((o) => o.textContent)).toEqual(['Recent → old', 'Old → recent', 'A → Z', 'Z → A']);
    $('.site-manager__select').focus();
    pickOrder('oldest');
    expect(sites()).toEqual(['beta.org', 'alpha.net', 'example.com (current)']);
    pickOrder('az');
    expect(sites()).toEqual(['alpha.net', 'beta.org', 'example.com (current)']);
    pickOrder('za');
    expect(sites()).toEqual(['example.com (current)', 'beta.org', 'alpha.net']);
    expect(document.activeElement).toBe($('.site-manager__select'));
    await settle();
    expect(settingsService.sitesOrder).toBe('za');

    manager.destroy();
    await mount();
    expect($('.site-manager__select').value).toBe('za');
    expect(sites()[0]).toBe('example.com (current)');
  });

  it('shows a spinner while listing, and says when there\'s nothing', async () => {
    const held = deferred();
    const storage = panel.fake.storage.local;
    const realGet = storage.get.bind(storage);
    const get = spyOn(storage, 'get').andCallFake((k) => (k === null ? held.promise.then(() => realGet(k)) : realGet(k)));
    await mount();
    expect($('.site-manager__loading a11y-spinner').getAttribute('label')).toBe('Loading your sites');
    held.resolve();
    await settle();
    get.restore();
    expect($('.site-manager__loading')).toBeFalsy();

    await scopeStoreService.clearEverything();
    await settle();
    expect($('.site-manager__empty').textContent).toBe('No notes or to-dos yet.');
  });

  it('follows changes made elsewhere', async () => {
    await mount();
    await scopeStoreService.addNote('page', 'https://new.dev/a', 'New');
    await settle();
    expect(sites()[0]).toBe('new.dev');
  });

  it('deletes everything on a site once confirmed, its pages included, and can undo it', async () => {
    await mount();
    row('example.com').querySelector('.site-row__delete').click();
    await settle();

    expect(asked).toEqual([{ title: 'Delete everything on example.com?', message: '1 note and 1 to-do, on the site and its pages.', confirmLabel: 'Delete' }]);
    expect(keys()).toEqual(['notes:page:https://beta.org/x', 'todos:page:https://alpha.net']);
    expect(sites()).toEqual(['alpha.net', 'beta.org']);
    // The next site takes the deleted one's place, and the focus.
    expect(document.activeElement).toBe(row('alpha.net').querySelector('.site-row__delete'));

    const toast = panel.toasts.at(-1);
    expect(toast.message).toBe('example.com: 1 note and 1 to-do deleted.');
    toast.onAction();
    await settle();
    expect(sites()).toEqual(['example.com (current)', 'alpha.net', 'beta.org']);
  });

  it('deletes nothing when cancelled, and reports a failed delete or listing', async () => {
    await mount();
    answer = false;
    row('beta.org').querySelector('.site-row__delete').click();
    await settle();
    expect(keys().length).toBe(4);

    answer = true;
    const remove = spyOn(panel.fake.storage.local, 'remove').andCallFake(async () => { throw new Error('Nope.'); });
    row('beta.org').querySelector('.site-row__delete').click();
    await settle();
    remove.restore();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t delete this site\'s notes. Nope.');

    const get = spyOn(panel.fake.storage.local, 'get').andCallFake(async () => { throw new Error('Gone.'); });
    panel.bus.emit('scope-content-changed', { keys: ['notes:site:beta.org'] });
    await settle();
    get.restore();
    expect(panel.toasts.at(-1).message).toBe('Couldn\'t list your sites. Gone.');
    expect(sites().length).toBe(3);
  });

  it('goes back to the settings', async () => {
    await mount();
    $('.site-manager__back').click();
    expect(backs).toBe(1);
  });
});
