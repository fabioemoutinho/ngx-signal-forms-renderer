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

> Requires Angular 22+.

## Quick Start

### 1. Register your control components

```typescript
// app.config.ts
import { provideSignalFormsRenderer } from 'ngx-signal-forms-renderer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideSignalFormsRenderer({
      types: {
        text: TextInputComponent,
        select: SelectInputComponent,
        textarea: TextareaInputComponent,
      },
    }),
  ],
};
```

### 2. Define your form (signal forms)

```typescript
import { signal } from '@angular/core';
import { form, required, email } from '@angular/forms/signals';

interface UserProfile {
  name: string;
  email: string;
  role: string;
}

const model = signal<UserProfile>({ name: '', email: '', role: 'user' });

const userForm = form(model, (f) => {
  required(f.name);
  email(f.email);
});
```

### 3. Describe the layout

Inputs to your components are passed as **`bindings`** using `inputBinding` from `@angular/core`
(reactive — they also support `outputBinding` and `twoWayBinding`).

```typescript
import { inputBinding } from '@angular/core';
import { layout, control, group } from 'ngx-signal-forms-renderer';

const userLayout = layout(userForm, (f) => [
  group(
    {
      name: control(f.name, { type: 'text', bindings: [inputBinding('label', () => 'Full name')] }),
      email: control(f.email, {
        type: 'text',
        bindings: [inputBinding('label', () => 'Email'), inputBinding('inputType', () => 'email')],
      }),
      role: control(f.role, {
        type: 'select',
        bindings: [inputBinding('label', () => 'Role'), inputBinding('options', () => ['user', 'editor', 'admin'])],
      }),
    },
    { component: CardGroupComponent, bindings: [inputBinding('title', () => 'Personal info')] },
  ),
]);
```

### 4. Render it

```html
<sfr-form [layout]="userLayout" />
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
- **`when`** / **`switchCase`** — conditional layout (the layout's `@if` / `@switch`). They render
  the active branch's nodes and no element of their own.

### Component resolution (two-tier)

Every node resolves its component the same way:

1. **Direct component reference** (`component`) — highest priority
2. **String `type`** resolved via the registry from `provideSignalFormsRenderer({ types })`

```typescript
control(f.bio, { component: RichTextEditor });        // direct
control(f.name, { type: 'text' });                    // from the registry
```

### Bindings & directives

Layout nodes carry `bindings` and `directives` instead of a plain props object — the same vocabulary
the renderer uses internally. `inputBinding(name, value)` takes a **value accessor** (`() => value`):
a signal already is one, so pass it directly; wrap plain/static values in `() => value`.

```typescript
import { inputBinding, outputBinding } from '@angular/core';

control(f.email, {
  type: 'text',
  bindings: [
    inputBinding('label', () => 'Email'),       // static input value — wrap in an accessor
    inputBinding('hint', hintSignal),           // a signal is already () => value — pass it directly
    outputBinding('focused', onFocus),          // output listener — pass the handler directly
  ],
  directives: [TooltipDirective],               // host directives, conditionally if you like
});
```

Consumer `bindings`/`directives` are merged *after* the renderer's own (the `field`/`state` inputs,
or the `FormField` directive for `FormValueControl`/`FormCheckboxControl` components) — don't re-bind those.

### Visibility

- **Conditional fields** — use signal forms' `hidden()` in the schema. A node that maps to a field
  (any control, or a data-driven group/array) defers to it automatically, and a hidden field is also
  excluded from validation.
- **Conditional layout** — use `when()` / `switchCase()` for structure that doesn't map to a single
  field (a card around several fields, a sub-form per plan). `when(field, …)` renders while that
  field is visible, so a condition that affects validity is written once, in the schema.

```typescript
// In the signal forms schema (semantic — also excluded from validation)
const userForm = form(model, (f) => {
  hidden(f.bio, { when: ({ valueOf }) => valueOf(f.role) !== 'admin' });
});

// In the layout: the card renders while the bio field is visible
when(f.bio, () => group({ bio: control(f.bio) }, { type: 'card' }));
```

Fields inside an inactive `when`/`switchCase` branch still validate, since a branch is layout only.
Pair the branch with `hidden()` / `applyWhenValue()` in the schema when its fields shouldn't.

## API Reference

You build layouts with the functions below — you don't construct node objects by hand. `control`,
`group` and `array` accept the same **options** object (`when` and `switchCase` take none):

| Option       | Type                                                | Purpose                                              |
| ------------ | --------------------------------------------------- | ---------------------------------------------------- |
| `component`  | `Type<unknown>`                                     | Render with this component (takes precedence).        |
| `type`       | `string`                                            | Component registered via `provideSignalFormsRenderer`. |
| `bindings`   | `Binding[]`                                          | Inputs/outputs (`inputBinding`/`outputBinding`/`twoWayBinding`). |
| `directives` | `(Type<unknown> \| DirectiveWithBindings<unknown>)[]` | Host directives to attach.                            |

The builders return `LayoutNode`s — the only type you'll reference directly, as the `children` input
on custom group/array wrapper components.

### Builder functions

#### `control(field, options?)`

```typescript
control(f.name);
control(f.name, { type: 'text', bindings: [inputBinding('label', () => 'Name')] });
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
a nested object (an address, etc.). The group also defers to the field's native `hidden()`.

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

**Renderer-owned** — the component receives the array `field` itself and does its own iteration and
mutation. Use when you want full control over how the array renders and changes.

```typescript
array(f.items, { component: ItemsListComponent });
```

#### `when(condition, () => nodes, () => elseNodes?)`

Renders the first branch while `condition` is true, else the optional second branch. `condition` is a
signal or function returning a boolean, or a field (renders while the field is visible). Branches are
functions returning a node or an array of nodes. A branch is built when it becomes active and rebuilt
only when the condition flips, so changing the values the condition reads keeps its components.

```typescript
when(isBusiness, () => [control(f.company), control(f.vatId)]);
when(() => f.country().value() === 'US', () => control(f.state), () => control(f.region));
when(f.company, () => group({ company: control(f.company) }, { type: 'card' }));
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
  group({ name: control(f.name, { type: 'text' }) }),
  array(f.items, (item) => group(item, (g) => ({ name: control(g.name) }))),
]);
```

### Provider

```typescript
provideSignalFormsRenderer({
  types: { text: TextInputComponent, select: SelectInputComponent, card: CardGroupComponent },
});
```

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
  readonly label = input('');                            // from bindings
}
```

A control that only binds via `[formField]` and shows no errors can declare just `field`.

**Pattern B — fully custom control** implementing `FormValueControl<T>`. The renderer attaches the
`FormField` directive, which binds `value`/`touched`/etc. — no `field` needed:

```typescript
export class RatingComponent implements FormValueControl<number> {
  readonly value = model(0);   // required — two-way bound by FormField
  readonly label = input('');  // from bindings
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

Receive `children` (and any custom `bindings`). Render them with `<sfr-children>`, or iterate for
custom placement.

```typescript
export class StepperComponent {
  readonly children = input.required<LayoutNode[]>();
}
```

## Layout composability

Layouts are plain functions returning `LayoutNode[]`, so composition is just TypeScript.

```typescript
function addressFields(addr: FieldTree<Address>): Record<string, LayoutNode> {
  return {
    street: control(addr.street, { type: 'text', bindings: [inputBinding('label', () => 'Street')] }),
    city: control(addr.city, { type: 'text', bindings: [inputBinding('label', () => 'City')] }),
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

## License

MIT
