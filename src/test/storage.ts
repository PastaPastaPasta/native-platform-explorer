export function installStorageMock(
  target: 'localStorage' | 'sessionStorage',
  initial?: Record<string, string>,
): Storage {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  const mock = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;

  Object.defineProperty(window, target, {
    configurable: true,
    value: mock,
  });

  return mock;
}

