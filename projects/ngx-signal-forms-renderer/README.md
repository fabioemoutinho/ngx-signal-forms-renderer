# ngx-signal-forms-renderer

Render Angular Signal Forms from a declarative layout.

**ngx-signal-forms-renderer** is a UI-agnostic library that renders a form from a layout
description, powered by Angular Signal Forms (`@angular/forms/signals`). It separates form
concerns into two layers:

1. **Signal Forms** — data model + validation + metadata (your domain, untouched)
2. **Layout** — structure + which component renders each field (controls, groups, arrays)

You bring your own control components; the renderer wires them to the form.

[Live Demo](https://fabioemoutinho.github.io/ngx-signal-forms-renderer)

## Installation

```bash
npm install ngx-signal-forms-renderer
```

> Requires Angular 22.1 or later; 22.2.2+ is recommended (it fixes a `debounce(…, 'blur')` value
> being lost when its control is destroyed, which conditional layouts do).

## Quick Start

### 1. Register your control components

```typescript
// app.config.ts
import { provideSignalFormsRenderer } from 'ngx-signal-forms-renderer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideSignalFormsRenderer({
      components: {
        text: TextInputComponent,
        select: SelectInputComponent,
        textarea: TextareaInputComponent,
      },
    }),
  ],
};
```

### 2. Define your form (signal forms)

In a component, since `form()` needs an injection context:

```typescript
import { Component, signal } from '@angular/core';
import { form, required, email } from '@angular/forms/signals';

interface UserProfile {
  name: string;
  email: string;
  role: string;
}

@Component({ /* step 4 */ })
export class ProfileFormComponent {
  readonly model = signal<UserProfile>({ name: '', email: '', role: 'user' });

  readonly userForm = form(this.model, (f) => {
    required(f.name);
    email(f.email);
  });
}
```

### 3. Describe the layout

Each node names its `component` (a registered key or a class) and passes fixed values as
**`inputs`**. Values that change go in **`bindings`** (`inputBinding`, `outputBinding`,
`twoWayBinding` from `@angular/core`). In the same component:

```typescript
import { layout, control, group } from 'ngx-signal-forms-renderer';

  readonly userLayout = layout(this.userForm, (f) => [
    group(
      {
        name: control(f.name, { component: 'text', inputs: { label: 'Full name' } }),
        email: control(f.email, { component: 'text', inputs: { label: 'Email' } }),
        role: control(f.role, {
          component: 'select',
          inputs: { label: 'Role', options: ['user', 'editor', 'admin'] },
        }),
      },
      { component: CardGroupComponent, inputs: { title: 'Personal info' } },
    ),
  ]);
```

### 4. Render it

```typescript
import { SfrFormComponent } from 'ngx-signal-forms-renderer';

@Component({
  selector: 'app-profile-form',
  imports: [SfrFormComponent],
  template: `<sfr-form [layout]="userLayout" />`,
})
export class ProfileFormComponent { /* steps 2–3 */ }
```

## Core Concepts

### Two-layer architecture

```
Signal Form (data + validation)          Layout (structure + components)
form(model, schema)                       layout(form, f => [...])
         \                                        /
          \                                      /
           +------  <sfr-form>  ----------------+
                    walks the layout tree
                    resolves each node's component
                    renders it dynamically with reactive bindings
```

The layout never touches your data rules; signal forms never knows about rendering. A control
component you write gets the real `FieldTree`, so it keeps full access to signal forms features
(validation, `hidden()`, `disabled()`, metadata, …) — the renderer stays out of the way.

### Layout node kinds

- **`control`** — a form control. Its component implements `FormValueControl<T>` /
  `FormCheckboxControl`, or receives the `field` and wires `[formField]` itself. Either way it gets
  `field` (and `state`) if it declares them.
- **`group`** — a keyed collection of nodes (`Record<string, LayoutNode>`), optionally wrapped in a
  component. Can be data-driven from a sub-object field.
- **`array`** — a list of nodes: static, renderer-owned, or library-iterated from an array field.
- **`content`** — a component that isn't bound to a field: a heading, help text, an alert,
  form-level errors, a derived value.
- **`when`** / **`switchCase`** — conditional layout (the layout's `@if` / `@switch`). They render
  the active branch's nodes and no element of their own.

### Component resolution

Every node names its component in one `component` option: a class, or a key registered with
`provideSignalFormsRenderer({ components })`.

```typescript
control(f.bio, { component: RichTextEditor });        // a class
control(f.name, { component: 'text' });               // a key from the registry
```

### Inputs, bindings & directives

**`inputs`** holds fixed values, keyed by the component's input names. When `component` is a class,
they're type-checked against its signal inputs (`input()`, `model()`): an unknown name or a wrong
value type is a compile error. With a registry key, or a class that may be a key, they're untyped.

```typescript
control(f.rating, { component: RatingComponent, inputs: { label: 'Rating', stars: 10 } });
```

- Each value is bound with `inputBinding`, so Angular decides where it goes: the component, or an
  input the component exposes from its own `hostDirectives`. A name neither declares makes Angular
  throw NG0315 in dev mode (in production it's ignored), as it does for `bindings`.
- An aliased input (`input(5, { alias: 'maxValue' })`) is written by its property name; the renderer
  binds it under its public name.
- `undefined` values are skipped, so the component keeps its own default. The values are fixed: for
  one that changes, bind a signal in `bindings`.
- A signal is passed as the value itself, for an input that takes a signal; the component reads it.
  Dev mode warns, since `bindings: [inputBinding(name, signal)]` is usually what's meant.
- Inputs the renderer binds itself (`field`, `state`, `children`) are ignored, with a dev-mode
  warning. So are, on a form control, the inputs the `FormField` directive sets from the field's
  state (`value`, `required`, `disabled`, `min`, `max`, `minLength`, `maxLength`, `pattern`,
  `errors`, …), as Angular rejects those bindings next to `[formField]` in templates too. Set them
  through the form instead: `value` in the model, the others that have a schema rule with that rule
  (`max(p.rating, 5)`, `disabled(p.rating)`); the rest (`errors`, `dirty`, …) Angular computes.
- Required inputs (`input.required()`) aren't enforced by the type: a missing one compiles, and
  Angular throws NG0950 when the component reads it.

What's typed, and what goes through `bindings` instead:

- Only signal inputs are typed. A decorator `@Input()` on a class that also has signal inputs, or a
  `protected` input, goes through `bindings`.
- Inputs a class exposes from its own `hostDirectives` aren't typed either (TypeScript can't see
  decorator arguments): bind them with `bindings: [inputBinding('tooltip', () => 'Hi')]`.
- A choice of classes (`component: compact ? RatingInput : TextInput`) accepts the inputs of any of
  them. For an input only one of them has, write each class as its own node:

  ```typescript
  compact()
    ? control(f.score, { component: RatingInput, inputs: { stars: 10 } })
    : control(f.score, { component: TextInput, inputs: { placeholder: 'Score' } });
  ```

- Options built in a variable are checked with `satisfies`, which also keeps literal values like
  `'email'` from widening to `string`:

  ```typescript
  const rating = { component: RatingComponent, inputs: { label: 'Rating' } } satisfies LayoutNodeOptions<typeof RatingComponent>;
  ```

**`directives`** attaches directives to the component, like `<my-comp tooltip>` in a template. A
directive's inputs aren't reachable through the node's `inputs` or `bindings` (Angular aims those at
the component), so each directive entry takes its own, untyped. An entry is the directive alone, or
the directive with fixed `inputs` and changing `bindings`:

```typescript
directives: [TooltipDirective]                                                      // no inputs
directives: [{ type: TooltipDirective, inputs: { text: 'Your work email' } }]       // fixed values
directives: [{ type: TooltipDirective, bindings: [inputBinding('text', hint)] }]    // values that change
```

A directive entry's `inputs` use the directive's **public** names, the ones a template uses
(`{ type: MatTooltip, inputs: { matTooltip: 'Hi' } }`), while a node's `inputs` use the component's
**property** names. An entry's `bindings` are applied after its `inputs`. On a form control,
`FormField` sets `required`, `disabled`, `max` and its other inputs (all but `value`/`checked`) on
every directive that declares them, so those names are ignored on directive entries too.

**`bindings`** are for values that change, and for outputs. `inputBinding(name, value)` takes a
**value accessor** (`() => value`): a signal already is one, so pass it directly.

```typescript
import { inputBinding, outputBinding } from '@angular/core';

control(f.email, {
  component: 'text',
  inputs: { label: 'Email' },                   // fixed value
  bindings: [
    inputBinding('hint', hintSignal),           // a signal is already () => value — pass it directly
    outputBinding('focused', onFocus),          // output listener — pass the handler directly
  ],
  directives: [TooltipDirective],               // directives, conditionally if you like
});
```

The renderer's own bindings come first (the `field`/`state`/`children` inputs, or the `FormField`
directive for `FormValueControl`/`FormCheckboxControl` components), then `inputs`, then your
`bindings` and `directives`. A binding for an input also set in `inputs` overrides it; don't re-bind
the renderer's own inputs.

### Visibility

- **Conditional fields** — use signal forms' `hidden()` in the schema. A node that maps to a field
  (any control, or a data-driven group/array) defers to it automatically, and a hidden field is also
  excluded from validation.
- **Conditional layout** — use `when()` / `switchCase()` for structure that doesn't map to a single
  field (a card around several fields, a sub-form per plan). `when(field, …)` renders while that
  field is visible, so a condition that affects validity is written once, in the schema.

```typescript
// In the signal forms schema (semantic — also excluded from validation)
hidden(f.bio, { when: ({ valueOf }) => valueOf(f.role) !== 'admin' });

// In the layout: the card renders while the bio field is visible
when(f.bio, () => group({ bio: control(f.bio) }, { component: 'card' }));
```

Fields inside an inactive `when`/`switchCase` branch still validate, since a branch is layout only.
Pair the branch with `hidden()` / `applyWhenValue()` in the schema when its fields shouldn't.

A branch that stops being active is destroyed with its components; if the focused element was inside
it, focus moves to the page. Keep the control that flips a branch outside it, or move focus yourself
(see [RECIPES.md](./RECIPES.md#showing-and-hiding-which-tool)).

See [RECIPES.md](./RECIPES.md) for which tool fits which case, wizard steps, and a sub-form per type.

## API Reference

You build layouts with the functions below — you don't construct node objects by hand. `control`,
`group` and `array` accept the same **options** object (`content` takes the component as its first
argument, then `inputs`, `bindings` and `directives`; `when` and `switchCase` take none):

| Option       | Type                                                | Purpose                                              |
| ------------ | --------------------------------------------------- | ---------------------------------------------------- |
| `component`  | `string \| Type<C>`                                  | A key registered via `provideSignalFormsRenderer`, or a class. |
| `inputs`     | the component's inputs (typed for a class)          | Fixed input values.                                  |
| `bindings`   | `Binding[]`                                          | Inputs/outputs that change (`inputBinding`/`outputBinding`/`twoWayBinding`). |
| `directives` | `NodeDirective[]`                                    | Directives to attach: a class, or `{ type, inputs?, bindings? }`. |

The builders return `LayoutNode`s — the only type you'll reference directly, as the `children` input
on custom group/array wrapper components.

### Builder functions

#### `control(field, options?)`

```typescript
control(f.name);
control(f.name, { component: 'text', inputs: { label: 'Name' } });
control(f.name, { component: CustomInput });
```

#### `group(...)`

A keyed collection of nodes, optionally wrapped in a component. Two forms:

**Explicit children** — a fixed set of keyed nodes. Use to group unrelated top-level fields under one
wrapper (e.g. a card).

```typescript
group({ name: control(f.name), email: control(f.email) });
group({ name: control(f.name) }, { component: CardComponent });
```

**Data-driven** — bound to a sub-object field; the callback receives that object's sub-fields. Use for
a nested object (an address, etc.). The group also defers to the field's native `hidden()`. The
callback runs as part of the layout function, so a signal read inside it re-runs that function.

```typescript
group(f.address, (g) => ({ street: control(g.street), city: control(g.city) }));
group(f.address, { component: AddressCard }, (g) => ({ street: control(g.street) }));
```

#### `array(...)`

A list of nodes. Four forms, differing in **who owns iteration**:

**Static** — a fixed, ordered set of nodes (not driven by an array field). Use for things like wizard
steps that just need ordering.

```typescript
array([control(f.step1), control(f.step2)]);
```

**Library-iterated** — the renderer iterates the array field and builds one node per item from your
`itemLayout`. Use for a plain repeating list. Item identity is tracked, so editing/adding/removing/
reordering doesn't recreate (or lose focus in) the other rows.

```typescript
array(f.items, (item) => group(item, (g) => ({ name: control(g.name) })));
```

**Library-iterated + wrapper** — same per-item iteration, but the per-item nodes are passed to a
wrapper component as its `children`. Use when the list needs UI around each item (reorder, remove,
"add"): the library builds each item, your component arranges them and adds the controls.

```typescript
array(f.items, { component: SortableList }, (item) => group(item, (g) => ({ name: control(g.name) })));
```

Library-iterated arrays (with or without a wrapper) also take an **`empty`** node, rendered as the only
child while the array has no items — the layout's `@empty`:

```typescript
array(f.items, { empty: content('hint', { inputs: { text: 'No items yet' } }) }, itemLayout);
```

**Renderer-owned** — the component receives the array `field` itself and does its own iteration and
mutation. Use when you want full control over how the array renders and changes.

```typescript
array(f.items, { component: ItemsListComponent });
```

#### `content(component, { inputs?, bindings?, directives? })`

A component that isn't bound to a field. Pass a class or a registered key. It receives only the
`inputs` and `bindings` you give it — the renderer binds none of its own. Read form state inside a
binding to show derived values or form-level errors; the component updates in place.

```typescript
content('heading', { inputs: { text: 'Billing' } });
content(FormErrors, { bindings: [inputBinding('errors', () => userForm().errorSummary())] });
```

#### `when(condition, () => nodes, () => elseNodes?)`

Renders the first branch while `condition` is true, else the optional second branch. `condition` is a
signal or function returning a boolean, or a field (renders while the field is visible). Branches are
functions returning a node or an array of nodes. A branch is built when it becomes active and rebuilt
only when the condition flips, so changing the values the condition reads keeps its components.

```typescript
when(isBusiness, () => [control(f.company), control(f.vatId)]);
when(() => f.country().value() === 'US', () => control(f.state), () => control(f.region));
when(f.company, () => group({ company: control(f.company) }, { component: 'card' }));
```

#### `switchCase(key, cases, { default? })`

Renders the case whose name equals `String(key)`, else `default` (also for a `null`/`undefined` key).
`key` is a function or a field; case names are typed against its values. A case is rebuilt only when
the matched case changes.

```typescript
switchCase(f.plan, {
  business: () => [control(f.company), control(f.vatId)],
  personal: () => control(f.birthDate),
}, { default: () => [] });
```

#### `layout(form, fn)`

Returns a `Signal<LayoutNode[]>`. If `fn` reads a signal, it re-runs when that signal changes and
recreates every component it renders (a dev-mode warning says so). That suits structure that changes
rarely, like fields decided by loaded config; for conditions that change while the user fills the
form, use `when()` / `switchCase()` or the schema's `hidden()`.

```typescript
const myLayout = layout(userForm, (f) => [
  group({ name: control(f.name, { component: 'text' }) }),
  array(f.items, (item) => group(item, (g) => ({ name: control(g.name) }))),
]);
```

Only reads in `fn`'s own body count, including data-driven `group(field, (g) => …)` callbacks, which
run right away. `when()` / `switchCase()` conditions and branches, `array()` item layouts and binding
closures run later, on their own. As in any `computed`, choose what rebuilds the form by reading those
signals first and building the rest inside `untracked()`:

```typescript
const configured = layout(userForm, (f) => {
  const { showPhone } = config(); // tracked: a config change rebuilds the form
  return untracked(() => [
    control(f.name, { component: 'text' }),
    ...(showPhone ? [control(f.phone, { component: 'text' })] : []),
  ]);
});
```

### Provider

```typescript
provideSignalFormsRenderer({
  components: { text: TextInputComponent, select: SelectInputComponent, card: CardGroupComponent },
});
```

Registrations merge. Several calls in the same injector add up (a feature library can ship its own
`provideSignalFormsRenderer` next to the app's), and a route's or component's registry extends its
parent's — add or override components for one part of the app without repeating the rest. Where both
define a key, the child's wins. It works in `ApplicationConfig.providers`, route `providers` and
component `providers`:

```typescript
@Component({
  providers: [provideSignalFormsRenderer({ components: { card: CompactCardComponent } })],
  template: `<sfr-form [layout]="layout" />`, // `card` is compact here; other keys come from the app
})
export class SidebarFormComponent {}
```

Registering the same key twice in one injector logs a dev-mode warning (the last one wins). A node whose
`component` key isn't registered also warns: controls and content render nothing, groups and arrays
render their children without a wrapper.

### Components

#### `<sfr-form>`

| Input    | Type                   | Description                                               |
| -------- | ---------------------- | --------------------------------------------------------- |
| `layout` | `Signal<LayoutNode[]>` | Required. The signal from `layout()` (it holds the form). |

```html
<sfr-form [layout]="userLayout" />
```

#### `<sfr-children>`

Helper for custom group/array components to render their children. Renders no element of its own
(`display: contents`), so your component's element is the layout container.

```typescript
@Component({
  imports: [SfrChildrenComponent],
  template: `
    <mat-card>
      <mat-card-header><mat-card-title>{{ title() }}</mat-card-title></mat-card-header>
      <mat-card-content><sfr-children [children]="children()" /></mat-card-content>
    </mat-card>
  `,
})
export class CardGroupComponent {
  readonly title = input('');
  readonly children = input.required<Record<string, LayoutNode>>();
}
```

## Component contracts

### Control components

The renderer binds `field` (the `FieldTree`) and `state` (the `FieldState`) to **any** control
component **that declares those inputs** — so a control opts into exactly what it needs.

**Pattern A — wrap an existing UI control (Material, PrimeNG, …)** via `[formField]`:

```typescript
@Component({
  imports: [MatFormField, MatLabel, MatInput, MatError, FormField],
  template: `
    <mat-form-field>
      <mat-label>{{ label() }}</mat-label>
      <input matInput [formField]="field()" />
      <mat-error>{{ state().errors()[0]?.message }}</mat-error>
    </mat-form-field>
  `,
})
export class TextInputComponent {
  readonly field = input.required<FieldTree<string>>();
  readonly state = input.required<FieldState<string>>(); // declare only if you read it
  readonly label = input('');                            // from inputs or bindings
}
```

A control that only binds via `[formField]` and shows no errors can declare just `field`.

**Pattern B — fully custom control** implementing `FormValueControl<T>`. The renderer attaches the
`FormField` directive, which binds `value`/`touched`/etc. — no `field` needed:

```typescript
export class RatingComponent implements FormValueControl<number> {
  readonly value = model(0);   // required — two-way bound by FormField
  readonly label = input('');  // from inputs or bindings
  readonly stars = input(5);
}
```

It can still declare `field` and/or `state` to reach what `FormField` doesn't bind — custom
metadata, sibling fields, etc.:

```typescript
export class QuantityComponent implements FormValueControl<number> {
  readonly value = model(0);
  readonly state = input.required<FieldState<number>>(); // optional — bound if declared
  protected readonly stock = computed(() => this.state().metadata(STOCK)?.() ?? 0);
}
```

Both of Angular's custom-control contracts are supported: `FormValueControl<T>` (`value = model()`)
and `FormCheckboxControl` (`checked = model<boolean>()`).

### Group / array components

Receive `children` (and any `inputs` or `bindings` you give them). Render them with `<sfr-children>`,
or iterate for custom placement.

```typescript
export class StepperComponent {
  readonly children = input.required<LayoutNode[]>();
}
```

Wrappers of a data-driven group or an array field also receive `field` (the `FieldTree`) and `state`
(its `FieldState`) if they declare them — for section-level errors, pending state, or telling an array's
`empty` node apart from a single item. Like every reserved input, they're bound only when declared.

```typescript
export class SectionCardComponent {
  readonly children = input.required<Record<string, LayoutNode>>();
  readonly state = input<FieldState<unknown>>();   // e.g. state()?.errorSummary()
}
```

## Layout composability

Layouts are plain functions returning `LayoutNode[]`, so composition is just TypeScript.

```typescript
function addressFields(addr: FieldTree<Address>): Record<string, LayoutNode> {
  return {
    street: control(addr.street, { component: 'text', inputs: { label: 'Street' } }),
    city: control(addr.city, { component: 'text', inputs: { label: 'City' } }),
  };
}

const orderLayout = layout(orderForm, (f) => [
  group(f.shippingAddress, { component: CardGroupComponent }, addressFields),
  group(f.billingAddress, { component: CardGroupComponent }, addressFields),
]);
```

Because the layout is just data + functions, you can also build it from your own schema/config — the
[demo](https://fabioemoutinho.github.io/ngx-signal-forms-renderer) renders a whole checkout form from a
plain-data schema mapped onto these builders.

## Recipes

[RECIPES.md](./RECIPES.md) covers common tasks, each backed by a test:

- showing and hiding: which tool fits which case, and wizard steps
- a sub-form per type (`switchCase` + `applyWhenValue`)
- clearing a dependent value when the user changes another
- array item actions: add, remove, move
- form-level errors
- submitting with `<form [formRoot]>`, and focusing the first invalid field
- a file control

## License

MIT
