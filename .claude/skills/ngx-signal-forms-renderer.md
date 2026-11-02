---
name: ngx-signal-forms-renderer
description: Use this skill when working with ngx-signal-forms-renderer — an Angular library for auto-rendering forms using Signal Forms. Trigger when code imports from 'ngx-signal-forms-renderer', uses SfrFormComponent, control(), group(), array(), content(), when(), switchCase(), layout(), or provideSignalFormsRenderer().
---

# ngx-signal-forms-renderer — Signal Forms Auto-Renderer

## What it is

ngx-signal-forms-renderer auto-renders Angular forms from configuration, powered by Angular Signal Forms (`@angular/forms/signals`). Two layers:

1. **Signal Forms** — data model + validation (`form()`, `required()`, `hidden()`, etc.)
2. **Layout** — visual structure + rendering instructions: controls, groups, arrays

## Layout Node Kinds

- **`control`** — renders a form control. Either the component implements `FormValueControl<T>` / `FormCheckboxControl` (the renderer attaches `FormField` automatically, binding value, errors, touched, disabled, etc.), or it receives the `field` input and wires `[formField]` itself (Pattern A below).
- **`group`** — renders children inside an optional wrapper component
- **`array`** — repeatable section for array fields

## Key APIs

### Provider (app.config.ts)

```typescript
import { provideSignalFormsRenderer } from 'ngx-signal-forms-renderer';

provideSignalFormsRenderer({
  components: {
    text: TextInputComponent,
    select: SelectComponent,
    card: CardGroupComponent,       // groups can use registry too
    repeatable: RepeatableComponent, // arrays can use registry too
  },
})
```

Calls merge: several in one injector add up, and route/component `providers` extend the parent's registry (child wins on the same key). Use component `providers: [provideSignalFormsRenderer(...)]` to override a component for one form.

### Builder Functions

```typescript
import { inputBinding } from '@angular/core';
import { layout, control, group, array, content, when, switchCase } from 'ngx-signal-forms-renderer';

// control(fieldRef, options?) — renders a form control
control(f.name, { component: 'text', inputs: { label: 'Name' } })     // registry key, fixed inputs
control(f.bio, { component: RichTextEditor, inputs: { rows: 4 } })    // class: inputs are type-checked
control(f.email, { component: 'text', bindings: [inputBinding('hint', hintSignal)] })  // values that change

// group(children, options?) — explicit keyed children
group({ name: control(f.name) })
group({ name: control(f.name) }, { component: 'card', inputs: { title: 'Info' } })

// group(fieldRef, fn) or group(fieldRef, options, fn) — data-driven from a sub-object field
group(f.address, (a) => ({ street: control(a.street), city: control(a.city) }))

// array(fieldRef, itemLayout) or array(fieldRef, options, itemLayout) — one node per item
array(f.addresses, (addr) => group(addr, (a) => ({ street: control(a.street) })))
array(f.items, { component: ItemList })            // renderer-owned: component receives the field
array([control(f.step1), control(f.step2)])        // static ordered nodes
array(f.items, { empty: content('hint') }, itemLayout)  // `empty` renders while there are no items

// content(component, { inputs?, bindings?, directives? }) — a component not bound to a field
content('heading', { inputs: { text: 'Billing' } })

// when(condition, () => nodes, () => elseNodes?) — conditional layout (the layout's @if)
when(isBusiness, () => [control(f.company)], () => control(f.birthDate))
when(f.company, () => group({ company: control(f.company) }, { component: 'card' }))  // while field visible

// switchCase(key, cases, { default? }) — multi-branch layout (the layout's @switch)
switchCase(f.plan, { business: () => control(f.company) }, { default: () => [] })

// layout(formRef, fn) — returns Signal<LayoutNode[]>
const myLayout = layout(myForm, (f) => [
  group({ name: control(f.name), email: control(f.email) }),
]);
```

### Template Usage

```html
<sfr-form [layout]="myLayout" />
```

### Component Resolution

`component` is a class, or a key registered with `provideSignalFormsRenderer({ components })`, on controls, groups, arrays and content alike. All options go directly on the node.

### Inputs

- `inputs: { … }` — fixed input values. Typed from the class's signal inputs when `component` is a class; untyped for a registry key. A choice of classes (`cond ? A : B`) accepts any of their inputs; for an input only one has, write each class as its own node (`cond ? control(f.x, { component: A, inputs: {…} }) : control(f.x, { component: B })`). Keyed by property name (an aliased input is bound under its public name). Bound with `inputBinding`, so they also reach inputs the component exposes from its own `hostDirectives`; a name nothing declares throws NG0315 in dev. `undefined` values are skipped. A signal value is passed as the signal itself (dev warning); values that change go in `bindings`.
- `bindings: [inputBinding(…), outputBinding(…)]` — values that change, and outputs. Applied after `inputs`, so they override a static value.
- `directives: [entry, …]` — each entry is a directive class (`Dir`) or `{ type: Dir, inputs?: { … }, bindings?: [...] }`, at most one entry per directive. A directive's inputs go on its own entry (by public name, untyped); the node's `inputs`/`bindings` target the component only.
- Ignored with a dev warning: inputs the renderer binds (`field`, `state`, `children`) and, on a form control, inputs `FormField` sets (`value`, `required`, `disabled`, `min`, `max`, `errors`, …), on the component and, all but `value`/`checked`, on its directive entries. Set those through the form: `value` in the model, the ones with a schema rule through that rule (`max(p.x, 5)`, `disabled(p.x)`); the rest Angular computes. Angular rejects them next to `[formField]` in templates too.
- Not typed: decorator `@Input()`s on a class that also has signal inputs, `protected` inputs, and inputs from the class's own `hostDirectives` — use `bindings`. Required inputs aren't enforced. Options in a variable: `satisfies LayoutNodeOptions<typeof X>`.

### Control Component Contract

Two patterns:

**Pattern A: Wrapping existing UI components** — receive `field` and `state` inputs, use `[formField]` on the inner form element:

```typescript
@Component({
  imports: [MatFormField, MatInput, FormField],
  template: `
    <mat-form-field>
      <mat-label>{{ label() }}</mat-label>
      <input matInput [formField]="field()" />
      <mat-error>{{ state().errors()[0]?.message }}</mat-error>
    </mat-form-field>
  `,
})
export class TextInputComponent {
  readonly field = input.required<FieldTree<string>>();   // provided by the library
  readonly state = input.required<FieldState<string>>();  // provided by the library
  readonly label = input('');       // from inputs or bindings
}
```

**Pattern B: Fully custom controls** — implement `FormValueControl<T>`, only `value = model()` is required:

```typescript
export class RatingComponent implements FormValueControl<number> {
  readonly field = input.required<FieldTree<number>>(); // optional — bound if declared
  readonly value = model(0);          // required — two-way bound
  readonly errors = input([]);         // optional — auto-bound
  readonly disabled = input(false);    // optional — auto-bound
  readonly touched = model(false);     // optional — auto-bound
}
```

Both of Angular's custom-control contracts are supported: `FormValueControl<T>` (`value = model()`) and `FormCheckboxControl` (`checked = model<boolean>()`).

### Group Component Contract

```typescript
@Component({
  template: `
    <my-wrapper>
      <sfr-children [children]="children()" />
    </my-wrapper>
  `,
  imports: [SfrChildrenComponent],
})
export class MyGroupComponent {
  readonly children = input.required<Record<string, LayoutNode>>(); // provided by the library
  readonly state = input<FieldState<unknown>>(); // optional — data-driven groups/array fields only
  readonly title = input(''); // from inputs or bindings
}
```

### Visibility

- **Nodes mapped to a field** (controls, data-driven groups/arrays): use signal forms `hidden()` in the schema. The renderer reads `field().hidden()` automatically.
- **Layout structure** (a card around several fields, a sub-form per type): use `when()` / `switchCase()`. A branch is rebuilt only when its condition flips. `when(f.x, …)` renders while field `x` is visible, so validity conditions stay in the schema.
- Branches are layout only — fields in an inactive branch still validate. Pair with `hidden()` / `applyWhenValue()` in the schema.
- Branching on a signal inside `layout()` also works, but every re-run recreates all rendered components (dev-mode warning). Fine for rarely-changing structure (loaded config); use `when()` / `switchCase()` for anything that changes while the user types.
- Only reads in the `layout()` function's own body re-run it (data-driven `group(field, fn)` callbacks run right away, so they count); `when`/`switchCase` conditions and branches, `array` item layouts and binding closures don't. To choose what rebuilds the form: read those signals first, then `return untracked(() => [...])`.
- A branch that deactivates destroys its components; if focus was inside, it moves to the page. Keep the control that flips a branch outside it, or move focus with `focusBoundControl()`.

### Layout Composability

Layouts are plain functions — composability is free:

```typescript
function addressFields(addr: FieldTree<Address>): Record<string, LayoutNode> {
  return {
    street: control(addr.street, { component: 'text', inputs: { label: 'Street' } }),
    city: control(addr.city, { component: 'text', inputs: { label: 'City' } }),
  };
}

layout(orderForm, (f) => [
  group(f.shippingAddress, { component: 'card' }, addressFields),
  group(f.billingAddress, { component: 'card' }, addressFields),
]);
```

## Important Notes

- `FieldTree<T>` (not `Field<T>`) is the correct type from `@angular/forms/signals`
- Wrapper controls (Pattern A) use `[formField]` on their inner form element — the library passes `field` and `state` as inputs
- Custom controls (Pattern B) implement `FormValueControl<T>` — only `value = model()` is required; they also receive `field`/`state` if they declare them
- For Pattern B, `value` must be a `model()` (ModelSignal), not `input()` — it's two-way bound
- Use `protected readonly` for template-bound members, `private readonly` for internal state
- The library is UI-agnostic — bring your own components (Material, PrimeNG, custom, etc.)
- Requires Angular 22.1+ (signal forms); 22.2.2+ recommended
- Array item actions: remove by identity (`items.filter(i => i !== item().value())`); `keyInParent()` is a string at runtime — wrap it in `Number()` for index math
- Clear a dependent value on user edits with `outputBinding('valueChange', …)` on the driving control (it doesn't fire when the model is set from code)
- Submission is signal forms' job: wrap `<sfr-form>` in `<form [formRoot]="f">` with `form(model, schema, { submission: { action, onInvalid } })`
- More patterns: RECIPES.md in the library (sub-form per type, form-level errors, focus first error, file control)
