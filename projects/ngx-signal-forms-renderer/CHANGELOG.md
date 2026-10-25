# Changelog

All notable changes to `ngx-signal-forms-renderer` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While on `0.x`, any release
may contain breaking changes; they are always called out under **Breaking**.

## [Unreleased]

### Breaking

- The minimum supported Angular version is now **22.1.0** (peer dependencies `>=22.1.0`). Angular
  22.2.2 or later is recommended: it fixes a value typed into a `debounce(…, 'blur')` field being
  lost when its control is destroyed, which conditional layouts do.
- The node-level `hidden` option is removed from `control()`, `group()` and `array()`. Use the
  schema's `hidden()` for conditional fields (nodes still defer to it automatically), or wrap the
  node in `when()` for conditional layout. A node can no longer be shown while its field is hidden
  in the schema.

  ```ts
  // before
  group({ … }, { component: Card, hidden: computed(() => !isBusiness()) })
  // after
  when(isBusiness, () => group({ … }, { component: Card }))
  ```

- `LayoutNode` now also includes `WhenNode` and `SwitchCaseNode`. An exhaustive
  `switch (node.kind)` over layout nodes needs the new cases, and wrapper components that inspect
  their children (e.g. `children().x.field`) can now meet these nodes, which have no `field`.

### Added

- `when(condition, () => nodes, () => elseNodes)`: conditional layout, the layout's
  `@if`. `condition` is a signal or function returning a boolean, or a field — `when(f.company, …)`
  renders while that field is visible in the schema. Branches are builder functions, built only
  when they become active and rebuilt only when the condition flips, so changing the values the
  condition reads keeps the branch's components. Renders no element of its own.
- `switchCase(key, cases, { default: () => nodes })`: multi-branch layout, the layout's
  `@switch`. `key` is a function or a field; the case whose name equals `String(key)` renders, else
  `default` (also for a `null`/`undefined` key). Case names are typed against the key's values.
  A case is rebuilt only when the matched case changes.
- Both are layout only: fields in an inactive branch still validate. Pair them with the schema's
  `hidden()`/`applyWhenValue()` when they shouldn't. A dev-mode warning is logged when a branch
  re-runs while it stays active (it reads a signal), since that recreates its components.

- A dev-mode warning when a `layout()` function, or an array's item layout function, re-runs
  because it reads a signal. A re-run builds new nodes, so the components it renders are recreated
  (inputs lose focus and local state). That is fine for structure that changes rarely, such as
  loaded config; the warning makes the cost visible. Logged once per layout or item function.

### Fixed

- Group and array wrapper components no longer need to declare a `children` (or, for
  renderer-owned arrays, `field`) input. The renderer now binds these reserved inputs only when the
  component declares them, as it already did for controls; previously Angular threw NG0315
  ("does not have an input with a public name of …") in dev mode.

## [0.0.1-beta.1] - 2026-10-24

### Breaking

- `<sfr-form>` no longer has a `form` input. It was never read — the layout produced by
  `layout(form, fn)` already holds the form. Remove `[form]` from your templates:

  ```html
  <!-- before -->
  <sfr-form [form]="userForm" [layout]="userLayout" />
  <!-- after -->
  <sfr-form [layout]="userLayout" />
  ```

### Added

- Controls implementing Angular's `FormCheckboxControl` (a `checked = model<boolean>()`) now get
  the `FormField` directive attached, like `FormValueControl` controls. Previously they were left
  unbound.
- `FormValueControl` / `FormCheckboxControl` controls now also receive the `field` and `state`
  inputs when they declare them, so they can read custom metadata or sibling fields.

### Fixed

- In wrapper components that render items through `<sfr-children>`, removing or reordering array
  items no longer recreates the remaining rows (they kept focus and local state only in the
  no-wrapper path before).

### Changed

- Control contracts are detected with Angular's public `reflectComponentType` API instead of the
  private `ɵcmp` component definition.

### Known issues

- If the function passed to `layout()` reads a signal (e.g. branches on a field's value), every
  re-run recreates all rendered components — including the input being typed in. Prefer a
  node-level `hidden: computed(...)` for conditional fields, which does not re-run the layout.

## [0.0.1-beta.0] - 2026-06-07

### Added

- Initial beta: `<sfr-form>` renders a layout built with `layout()`, `control()`, `group()` and
  `array()` over an Angular Signal Forms `FieldTree`.
- Component resolution by direct `component` or by `type` key via `provideSignalFormsRenderer()`.
- Reactive `bindings` (`inputBinding`/`outputBinding`/`twoWayBinding`) and host `directives` per
  node; automatic `FormField` attachment for `FormValueControl` components.
- Data-driven groups and three array modes (static, renderer-owned, library-iterated), with
  visibility deferring to the field's native `hidden()` or a node-level `hidden` signal.
- `<sfr-children>` helper for custom group/array wrapper components.

[Unreleased]: https://github.com/fabioemoutinho/ngx-signal-forms-renderer/compare/v0.0.1-beta.1...HEAD
[0.0.1-beta.1]: https://github.com/fabioemoutinho/ngx-signal-forms-renderer/compare/v0.0.1-beta.0...v0.0.1-beta.1
[0.0.1-beta.0]: https://github.com/fabioemoutinho/ngx-signal-forms-renderer/releases/tag/v0.0.1-beta.0
