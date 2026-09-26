// jsdom polyfills for browser APIs the app's dependency stack reaches for but
// jsdom does not implement (PatternFly popper/tooltips, cmdk's list sizing,
// react-virtual, brand favicon swaps). Every install is idempotent and guarded
// so a future jsdom that ships the API wins. No behaviour is simulated — the
// stubs only keep constructors/calls from throwing during render.
//
// Imported for its side effects, first thing in a jsdom test file (usually via
// ./env, which also flips the mock engine on).

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class IntersectionObserverStub {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: readonly number[] = []
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

function matchMediaStub(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }
}

// Web Storage. Node ≥ 22 ships its own `localStorage`/`sessionStorage`
// globals: localStorage is a getter that yields undefined unless the process
// runs with --localstorage-file, and vitest's jsdom environment does not
// override a key Node already defines — so under jsdom `localStorage` is
// literally undefined and `sessionStorage` is Node's PROCESS-WIDE store, which
// would carry a session token from one test file into the next worker run.
// Both are replaced with a fresh in-memory Storage per test file.
class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();
  [name: string]: unknown

  get length(): number {
    return this.entries.size
  }
  clear(): void {
    this.entries.clear()
  }
  getItem(key: string): string | null {
    return this.entries.get(String(key)) ?? null
  }
  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.entries.delete(String(key))
  }
  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value))
  }
}

function installStorage(name: 'localStorage' | 'sessionStorage'): void {
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
    enumerable: true,
  })
}

installStorage('localStorage')
installStorage('sessionStorage')

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver
}

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = matchMediaStub
  }
  // jsdom implements scrollTo as a stub that logs "Not implemented" through its
  // virtual console on every call (PF's Page scrolls on route change), so it
  // is replaced unconditionally; the element-level ones are simply absent.
  window.scrollTo = () => {}
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {}
  }
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {}
  }
}
