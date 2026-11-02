import { afterEach, describe, expect, it, vi } from 'vitest';
import { warnOncePer } from './dev-warnings';

afterEach(() => vi.restoreAllMocks());

// Fresh key objects in every test, so the module-global dedupe never carries over between tests.
describe('warnOncePer', () => {
  it('logs each distinct message once per key, with the prefix and the context', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const key = {};
    const other = {};
    const el = {};
    warnOncePer(key, 'a', el);
    warnOncePer(key, 'a', el);
    warnOncePer(key, 'b');
    warnOncePer(other, 'a');
    expect(warn.mock.calls).toEqual([
      ['[ngx-signal-forms-renderer] a', el],
      ['[ngx-signal-forms-renderer] b'],
      ['[ngx-signal-forms-renderer] a'],
    ]);
  });

  it('logs nothing in production builds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('ngDevMode', false);
    try {
      warnOncePer({}, 'a');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
