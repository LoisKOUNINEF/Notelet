// In-memory stand-in for the `chrome.*` APIs the app uses (see services/chrome-api).
// Install it as the global `chrome` in a test's beforeEach, and remove it in afterEach:
//
//   beforeEach(() => { fake = installFakeChrome({ url: 'https://example.com/a' }); });
//   afterEach(() => uninstallFakeChrome());

function createEvent() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    hasListeners: () => listeners.size > 0,
    dispatch: (...args) => listeners.forEach((fn) => fn(...args)),
  };
}

// Values are cloned in and out, like the real storage's JSON serialization.
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function createStorageArea(name, onChanged, quota = {}) {
  const data = new Map();

  const emit = (changes) => {
    if (Object.keys(changes).length > 0) onChanged.dispatch(changes, name);
  };

  return {
    ...quota,
    data,
    failNextSet: null,
    async get(keys) {
      const wanted = keys === null || keys === undefined ? [...data.keys()] : [].concat(keys);
      return Object.fromEntries(wanted.filter((key) => data.has(key)).map((key) => [key, clone(data.get(key))]));
    },
    async set(items) {
      if (this.failNextSet) {
        const error = this.failNextSet;
        this.failNextSet = null;
        throw error;
      }
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: clone(data.get(key)), newValue: clone(value) };
        data.set(key, clone(value));
      }
      emit(changes);
    },
    async remove(keys) {
      const changes = {};
      for (const key of [].concat(keys)) {
        if (!data.has(key)) continue;
        changes[key] = { oldValue: clone(data.get(key)) };
        data.delete(key);
      }
      emit(changes);
    },
  };
}

export function createFakeChrome({ url = 'https://example.com/' } = {}) {
  const onChanged = createEvent();
  const activeTab = { id: 1, windowId: 1, active: true, url };

  const fake = {
    storage: {
      onChanged,
      local: createStorageArea('local', onChanged),
      sync: createStorageArea('sync', onChanged, { QUOTA_BYTES: 102400, QUOTA_BYTES_PER_ITEM: 8192, MAX_ITEMS: 512 }),
    },
    tabs: {
      onActivated: createEvent(),
      onUpdated: createEvent(),
      created: [],
      async query() {
        return [{ ...activeTab }];
      },
      async create(props) {
        fake.tabs.created.push(props);
        return { id: 2, ...props };
      },
    },
    // Test helpers: what Chrome does when the user acts.
    activateTab(newUrl) {
      activeTab.url = newUrl;
      fake.tabs.onActivated.dispatch({ tabId: 1, windowId: 1 });
    },
    navigate(newUrl) {
      activeTab.url = newUrl;
      fake.tabs.onUpdated.dispatch(1, { url: newUrl }, { ...activeTab });
    },
  };
  return fake;
}

export function installFakeChrome(options) {
  const fake = createFakeChrome(options);
  globalThis.chrome = fake;
  return fake;
}

export function uninstallFakeChrome() {
  delete globalThis.chrome;
}
