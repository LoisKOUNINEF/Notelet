import { BackupDataComponent } from '#root/dist/src/app/components/backup-data/backup-data.component.js';
import { MAX_BACKUP_SIZE } from '#root/dist/src/app/services/scope-store/backup.js';
import { confirmService } from '#root/dist/src/app/services/confirm/confirm.service.js';
import { scopeStoreService } from '#root/dist/src/app/services/scope-store/scope-store.service.js';
import { KEYS, settle, startPanel } from '../../testing/panel.js';

describe('BackupDataComponent', () => {
  let panel;
  let component;
  let downloads;
  let asked;
  let answer;
  let detach;

  const mount = async () => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    component = new BackupDataComponent(placeholder);
    downloads = [];
    component._download = (name, text, type) => downloads.push({ name, text, type });
    component.render();
    await settle();
  };
  const pick = async (text, name = 'notelet-2026-10-29.json') => {
    const input = $('.backup-data__file');
    Object.defineProperty(input, 'files', { value: [new window.File([text], name, { type: 'application/json' })], configurable: true });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };
  const messages = () => panel.toasts.map(({ message }) => message);

  beforeEach(async () => {
    panel = await startPanel();
    asked = [];
    answer = true;
    detach = confirmService.attach({ ask: async (options) => { asked.push(options); return answer; } });
  });

  afterEach(async () => {
    detach();
    component.destroy();
    await panel.stop();
  });

  it('exports every note and to-do as a dated JSON file', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'A note');
    await scopeStoreService.addTodo('site', KEYS.site, 'A to-do');
    await mount();
    $('.backup-data__export').click();
    await settle();

    expect(downloads.length).toBe(1);
    expect(downloads[0].name).toContain('notelet-');
    expect(downloads[0].type).toBe('application/json');
    expect(JSON.parse(downloads[0].text).format).toBe('notelet');
    expect(messages()).toContain('1 note and 1 to-do exported.');
  });

  it('says there\'s nothing to export, rather than saving an empty file', async () => {
    await mount();
    $('.backup-data__export').click();
    await settle();
    expect(downloads.length).toBe(0);
    expect(messages()).toContain('No notes or to-dos to export yet.');
  });

  it('imports a picked file once confirmed', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'Backed up');
    const file = JSON.stringify(await scopeStoreService.exportAll());
    await scopeStoreService.clearEverything();
    await mount();
    await pick(file);

    expect(asked[0].title).toBe('Import “notelet-2026-10-29.json”?');
    expect((await scopeStoreService.load(KEYS)).page.notes.map((n) => n.text)).toEqual(['Backed up']);
    expect(messages()).toContain('1 note imported.');
  });

  it('imports nothing when not confirmed', async () => {
    answer = false;
    await mount();
    const spy = spyOn(scopeStoreService, 'importAll');
    await pick('{}');
    expect(spy.callCount).toBe(0);
    spy.restore();
  });

  it('says why a file can\'t be imported', async () => {
    await mount();
    await pick('{"not": "a backup"}');
    expect(messages().some((m) => m.startsWith('Couldn\'t import that file. This file isn\'t a Notelet backup.'))).toBe(true);
  });

  it('refuses a file too large to be a backup, without reading it or asking', async () => {
    await mount();
    const input = $('.backup-data__file');
    const file = new window.File(['{}'], 'huge.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: MAX_BACKUP_SIZE + 1 });
    const text = spyOn(file, 'text');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    expect(asked.length).toBe(0);
    expect(text.callCount).toBe(0);
    expect(messages()).toContain('Couldn\'t import that file. This file is too large to be a Notelet backup.');
  });

  it('says when there\'s nothing new in a file', async () => {
    await scopeStoreService.addNote('page', KEYS.page, 'Already here');
    const file = JSON.stringify(await scopeStoreService.exportAll());
    await mount();
    await pick(file);
    expect(messages()).toContain('Nothing new to import: everything in that file is already here.');
  });

  it('is disabled while the notes move between storage areas', async () => {
    await mount();
    component.update({ busy: true });
    expect($('.backup-data__export').disabled).toBe(true);
    expect($('.backup-data__import').disabled).toBe(true);
    component.update({ busy: false });
    expect($('.backup-data__export').disabled).toBe(false);
  });

  it('does nothing when the picker is closed without a file, or while busy', async () => {
    await mount();
    const input = $('.backup-data__file');
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    expect(asked.length).toBe(0);

    component.update({ busy: true });
    const exportAll = spyOn(scopeStoreService, 'exportAll');
    await component._export();
    expect(exportAll.callCount).toBe(0);
    exportAll.restore();
  });

  it('reports a failed export', async () => {
    await mount();
    const exportAll = spyOn(scopeStoreService, 'exportAll').andCallFake(async () => { throw new Error('Gone.'); });
    $('.backup-data__export').click();
    await settle();
    expect(messages().some((m) => m.startsWith('Couldn\'t export your notes.'))).toBe(true);
    expect(downloads.length).toBe(0);
    exportAll.restore();
  });

  it('opens the file picker from its button', async () => {
    await mount();
    let opened = 0;
    $('.backup-data__file').addEventListener('click', () => opened++);
    $('.backup-data__import').click();
    expect(opened).toBe(1);
  });
});
