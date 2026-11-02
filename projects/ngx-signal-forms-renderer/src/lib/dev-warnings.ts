/** Keys (layout signals, item functions) already warned about, so each warns only once. */
const warned = new WeakSet<object>();

/**
 * Logs a dev-mode warning once per `key`. `context` (e.g. the host element) is logged after the
 * message so devtools can link to it. No-op in production builds.
 */
export function warnOnce(key: object, message: string, ...context: unknown[]): void {
  if (typeof ngDevMode !== 'undefined' && !ngDevMode) return;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[ngx-signal-forms-renderer] ${message}`, ...context);
}

/** Messages already logged per key (e.g. a component class), so each logs once per key. */
const warnedMessages = new WeakMap<object, Set<string>>();

/**
 * Logs a dev-mode warning once per distinct `message` for `key`, e.g. once per component class
 * however many nodes, array items or branch rebuilds render it. No-op in production builds.
 */
export function warnOncePer(key: object, message: string, ...context: unknown[]): void {
  if (typeof ngDevMode !== 'undefined' && !ngDevMode) return;
  let seen = warnedMessages.get(key);
  if (!seen) warnedMessages.set(key, (seen = new Set()));
  if (seen.has(message)) return;
  seen.add(message);
  console.warn(`[ngx-signal-forms-renderer] ${message}`, ...context);
}

/** Context shared by the layout re-run warnings. */
export const LAYOUT_RERUN_ADVICE =
  'If the signal read is accidental (e.g. inside a helper), wrap it in untracked(() => …). ' +
  'Re-runs are fine for structure that changes rarely (e.g. loaded config). For conditions that ' +
  "change while the user fills the form, when()/switchCase() or the schema's hidden() re-render " +
  'only what changes, and values can be read inside binding closures ' +
  '(inputBinding(name, () => …)). Shown once per layout function; later re-runs are not logged.';
