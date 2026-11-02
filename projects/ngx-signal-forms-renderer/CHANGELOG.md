# Changelog

All notable changes to `ngx-signal-forms-renderer` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While on `0.x`, any release
may contain breaking changes; they are always called out under **Breaking**.

## [Unreleased]

### Breaking

- Nodes name their component in one option, `component`, which now takes a registered key or a
  class. The separate `type` option is removed: move its key to `component`. (`component` used to
  win when both were set; with one option there is nothing to choose.)

  ```ts
  // before
  control(f.name, { type: 'text' })
  // after
  control(f.name, { component: 'text' })
  ```

  When migrating:
  - Directive entries keep Angular's `type` (`directives: [{ type: TooltipDirective, … }]`), so a
    blind find-and-replace of `type:` breaks them.
  - Options built in a variable and then spread aren't checked for unknown properties, so a leftover
    `type` there still compiles and the node renders without a component. Check those by hand, or
    with `satisfies LayoutNodeOptions`:

    ```ts
    const resolved = isRating ? { component: RatingInput } : { type: key };   // leftover `type`
    control(f.score, { ...resolved, bindings });                              // compiles
    ```
  - Code that reads nodes (e.g. a wrapper inspecting `children()`): every node kind lost `type`, and
    `node.component` is now `string | Type<unknown>` (a key or a class), not only a class.

    ```ts
    // before
    const isLabel = node.component === LabelComponent || node.type === 'label';
    // after
    const isLabel = node.component === LabelComponent || node.component === 'label';
    ```

- `provideSignalFormsRenderer({ types })` is now `provideSignalFormsRenderer({ components })`, and
  the exported `SignalFormsRendererTypeRegistry` type is now `SignalFormsRendererComponentRegistry`.
  The registry still maps keys to component classes, for every node kind.

  ```ts
  // before
  provideSignalFormsRenderer({ types: { text: TextInputComponent } })
  // after
  provideSignalFormsRenderer({ components: { text: TextInputComponent } })
  ```

- `content(typeOrComponent, options)`'s first parameter is now named `component`; calls don't
  change. A content node built from a key now stores it as `component` (`{ kind: 'content',
  component: 'heading' }`), not `type`.
- Dev-mode warnings for a node whose component doesn't resolve now read "Component 'x' is not
  registered, so this … node renders nothing" (was "Type 'x' …") or "A … node has no 'component'",
  log the node's element, and appear once per message for each registry (one per injector that
  provides components, so usually once per app) instead of once per node. The
  duplicate-registration warning says "Components registered more than once".

### Added

- `inputs` on every node with a component (`control`, `group`, `array`, `content`): fixed input
  values without `inputBinding`.

  ```ts
  // before
  control(f.name, { component: 'text', bindings: [inputBinding('label', () => 'Name')] })
  // after
  control(f.name, { component: 'text', inputs: { label: 'Name' } })
  ```

  When `component` is a class, `inputs` is typed from its signal inputs (`input()`, `model()`): an
  unknown name or a wrong value type is a compile error; a union of classes accepts the inputs of
  any of them. With a registry key, a class that may be a key, or a class with only decorator
  `@Input()`s, it's untyped. Each value is bound with `inputBinding`, so it also reaches inputs the
  component exposes from its own `hostDirectives` (with a class those aren't typed: use
  `bindings`), and a name nothing declares makes Angular throw
  NG0315 in dev mode, as with `bindings`. An aliased input is written by its property name and bound
  under its public name. `undefined` values are skipped, so the component keeps its default. A
  signal is passed as the value itself (for inputs that take a signal), with a dev-mode warning;
  values that change belong in `bindings`. A binding for the same input overrides the static
  value.
- `inputs` on directive entries: `directives: [{ type: TooltipDirective, inputs: { text: 'Hi' } }]`,
  applied before the entry's own `bindings`. Angular aims a node's `inputs` and `bindings` at the
  component, so a directive's values go on its entry.
- Types: `LayoutNodeOptions<K>` (and `ContainerOptions<K>`, `ArrayOptions<K>`) take the component
  (`typeof MyComponent`, or a key) as their parameter; `ComponentOrKey`, `ComponentInputs<K>`,
  `ComponentSignalInputs<C>` (a class's typed inputs) and `NodeDirective` are exported.
- Dev-mode warnings, each once per component class and message, logging the node's element: static
  inputs that are ignored because the renderer binds them itself (`field`, `state`, `children`) or,
  on a form control, because the `FormField` directive sets them from the field's state (`value`,
  `required`, `disabled`, `min`, `max`, `errors`, …; Angular rejects those bindings next to
  `[formField]` in templates too), each with what to do instead (set `value` in the model, use the
  schema rule of the same name, or nothing for what Angular computes); signals passed as static
  values, naming the `inputBinding` to use instead. And a warning when a group or array has
  `inputs`, `bindings` or `directives` but no component to receive them.

### Documentation

- `layout()`: which signal reads re-run it (its own body, including data-driven `group()`
  callbacks, which run right away; not `when`/`switchCase`, `array` item layouts or binding
  closures), and how to choose what rebuilds the form with `untracked()`.
- Inputs, bindings and directives: where each value goes, what's typed, and
  `satisfies LayoutNodeOptions<typeof X>` for options built in a variable.
- `when`/`switchCase`: a branch that stops being active takes the focused element with it; keep the
  control that flips it outside the branch, or move focus after the flip.
- The README and recipes use `component` and `inputs` throughout.

## [0.0.1-beta.2] - 2026-10-25

### Breaking

- The minimum supported Angular version is now **22.1.0** (peer dependencies `>=22.1.0`). Angular
  22.2.2 or later is recommended: it fixes a value typed into a `debounce(…, 'blur')` field being
  lost when its control is destroyed, which conditional layouts do.
- `provideSignalFormsRenderer()` registrations now merge instead of replacing each other: several
  calls in the same injector add up (previously the last one won), and a child injector's registry
  extends its parent's (previously it replaced it), with the child winning on the same key.
- `provideSignalFormsRenderer()` returns `Provider[]` instead of `EnvironmentProviders`, so it also
  works in component `providers`. This only breaks code that typed the result.
- `SIGNAL_FORMS_RENDERER_TYPE_REGISTRY` is no longer exported. It was marked internal; use
  `provideSignalFormsRenderer()` to register types.
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

- `LayoutNode` now also includes `ContentNode`, `WhenNode` and `SwitchCaseNode`. An exhaustive
  `switch (node.kind)` over layout nodes needs the new cases, and wrapper components that inspect
  their children (e.g. `children().x.field`) can now meet these nodes, which have no `field`.

### Added

- `when(condition, () => nodes, () => elseNodes)`: conditional layout, the layout's `@if`.
  `condition` is a signal or function returning a boolean, or a field — `when(f.company, …)`
  renders while that field is visible in the schema. Branches are builder functions, built only
  when they become active and rebuilt only when the condition flips, so changing the values the
  condition reads keeps the branch's components. Renders no element of its own.
- `switchCase(key, cases, { default: () => nodes })`: multi-branch layout, the layout's `@switch`.
  `key` is a function or a field; the case whose name equals `String(key)` renders, else `default`
  (also for a `null`/`undefined` key). Case names are typed against the key's values. A case is
  rebuilt only when the matched case changes.

  Both are layout only: fields in an inactive branch still validate. Pair them with the schema's
  `hidden()`/`applyWhenValue()` when they shouldn't.
- `content(typeOrComponent, { bindings, directives })`: a node for a component that isn't bound to
  a field — headings, help text, alerts, form-level errors, derived values. It receives only its
  own bindings.
- An `empty` option on library-iterated arrays (`array(field, { empty }, itemLayout)`): a node
  rendered as the only child while the array has no items, the layout's `@empty`. Its type,
  `ArrayOptions`, extends `ContainerOptions`, so `empty` is a type error on other arrays and groups.
- Group and array wrappers now receive `field` and `state` when they declare them and the node has
  a field: data-driven groups (`group(f.address, …)`), library-iterated arrays and renderer-owned
  arrays (which already received `field`). Use them for section-level errors and pending state, or
  to tell an array's `empty` node apart from a single item. Explicit groups and static arrays have
  no field.
- `provideSignalFormsRenderer()` in route and component `providers`, to add or override types for
  part of an app (see **Breaking** for how registrations now merge).
- Dev-mode warnings, each logged once:
  - when a `layout()` function, an array's item layout function, or a `when`/`switchCase` branch
    re-runs because it reads a signal. A re-run builds new nodes, so the components it renders are
    recreated (inputs lose focus and local state). That is fine for structure that changes rarely,
    such as loaded config; the warning makes the cost visible.
  - when a node's `type` isn't registered: a group or array renders its children without a
    wrapper, and the existing control warning (now also for `content`) names the type.
  - when the same type key is registered twice in one injector (the last registration wins).
- `RECIPES.md`, each recipe backed by a test: which show/hide tool fits which case, a sub-form per
  type, clearing a dependent value, array item actions, form-level errors, submitting with
  `<form [formRoot]>` and focusing the first invalid field, a file control.
- The npm package now includes `LICENSE` (MIT) and `RECIPES.md`.

### Fixed

- Group and array wrapper components no longer need to declare a `children` (or, for
  renderer-owned arrays, `field`) input. The renderer now binds these reserved inputs only when the
  component declares them, as it already did for controls; previously Angular threw NG0315
  ("does not have an input with a public name of …") in dev mode.
- The 0.0.1-beta.1 known issue — a `layout()` function that reads a signal recreates every
  component — now has a proper alternative: `when()`/`switchCase()` rebuild only their branch, on a
  flip. (The workaround it suggested, node-level `hidden`, is removed; see **Breaking**.)

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

[Unreleased]: https://github.com/fabioemoutinho/ngx-signal-forms-renderer/compare/v0.0.1-beta.2...HEAD
[0.0.1-beta.2]: https://github.com/fabioemoutinho/ngx-signal-forms-renderer/compare/v0.0.1-beta.1...v0.0.1-beta.2
[0.0.1-beta.1]: https://github.com/fabioemoutinho/ngx-signal-forms-renderer/compare/v0.0.1-beta.0...v0.0.1-beta.1
[0.0.1-beta.0]: https://github.com/fabioemoutinho/ngx-signal-forms-renderer/releases/tag/v0.0.1-beta.0
