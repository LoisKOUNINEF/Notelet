import { ScopePanelComponent } from '#root/dist/src/app/components/scope-panel/scope-panel.component.js';
import { KEYS, settle, startPanel } from '../../testing/panel.js';

const EMPTY = { page: { notes: [], todos: [] }, site: { notes: [], todos: [] } };
const note = (id, text) => ({ id, scope: 'page', key: KEYS.page, text, createdAt: 1, updatedAt: 1 });

describe('ScopePanelComponent', () => {
  let panel;
  let component;
  let picked;

  const state = (changes = {}) => ({ keys: KEYS, scope: 'page', kind: 'notes', content: EMPTY, loaded: true, sitePages: null, ...changes });
  const mount = (initial) => {
    const placeholder = document.getElementById('app').appendChild(document.createElement('div'));
    component = new ScopePanelComponent(placeholder, initial, {
      onSelectScope: (scope) => picked.push(scope),
      onSelectKind: (kind) => picked.push(kind),
    });
    component.render();
  };

  beforeEach(async () => {
    panel = await startPanel();
    picked = [];
  });

  afterEach(async () => {
    component.destroy();
    await panel.stop();
  });

  it('shows where it is, and the shown scope\'s lists', () => {
    mount(state());
    expect($('.scope-panel__location-text').textContent).toBe(KEYS.pageLabel);
    expect($('.note-list')).toBeTruthy();
  });

  it('isn\'t re-rendered when handed the same state', () => {
    const initial = state();
    mount(initial);
    const render = spyOn(component, 'render');
    component.update({ ...initial });
    expect(render.callCount).toBe(0);
    render.restore();
  });

  it('keeps its lists on the same scope, handing them the new items', async () => {
    mount(state());
    const list = component._noteList;
    component.update(state({ content: { ...EMPTY, page: { notes: [note('1', 'New')], todos: [] } } }));
    await settle();
    expect(component._noteList).toBe(list);
    expect(list.isDestroyed).toBe(false);
    expect($$('.note-item__text').map((el) => el.textContent)).toEqual(['New']);
  });

  it('waits for the lists to load: no "nothing yet" flashing by', () => {
    mount(state({ loaded: false }));
    expect($('.note-list')).toBeFalsy();
    expect($('.note-composer')).toBeTruthy();
  });

  it('hands the tabs picked over to the sidebar', () => {
    mount(state());
    $('#scope-tab-site').click();
    $('#kind-tab-todos').click();
    expect(picked).toEqual(['site', 'todos']);
  });
});
