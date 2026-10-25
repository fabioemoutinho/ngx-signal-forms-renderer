---
name: ngx-signal-forms-renderer
description: Use this skill when working with ngx-signal-forms-renderer — an Angular library for auto-rendering forms using Signal Forms. Trigger when code imports from 'ngx-signal-forms-renderer', uses SfrFormComponent, control(), group(), array(), layout(), or provideSignalFormsRenderer().
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
  types: {
    text: TextInputComponent,
    select: SelectComponent,
    card: CardGroupComponent,       // groups can use registry too
    repeatable: RepeatableComponent, // arrays can use registry too
  },
})
```

### Builder Functions

```typescript
import { inputBinding } from '@angular/core';
import { layout, control, group, array, content, when, switchCase } from 'ngx-signal-forms-renderer';

// control(fieldRef, options?) — renders a form control
control(f.name, { type: 'text', bindings: [inputBinding('label', () => 'Name')] })
control(f.bio, { component: RichTextEditor })

// group(children, options?) — explicit keyed children
group({ name: control(f.name) })
group({ name: control(f.name) }, { type: 'card', bindings: [inputBinding('title', () => 'Info')] })

// group(fieldRef, fn) or group(fieldRef, options, fn) — data-driven from a sub-object field
group(f.address, (a) => ({ street: control(a.street), city: control(a.city) }))

// array(fieldRef, itemLayout) or array(fieldRef, options, itemLayout) — one node per item
array(f.addresses, (addr) => group(addr, (a) => ({ street: control(a.street) })))
array(f.items, { component: ItemList })            // renderer-owned: component receives the field
array([control(f.step1), control(f.step2)])        // static ordered nodes
array(f.items, { empty: content('hint') }, itemLayout)  // `empty` renders while there are no items

// content(typeOrComponent, { bindings?, directives? }) — a component not bound to a field
content('heading', { bindings: [inputBinding('text', () => 'Billing')] })

// when(condition, () => nodes, () => elseNodes?) — conditional layout (the layout's @if)
when(isBusiness, () => [control(f.company)], () => control(f.birthDate))
when(f.company, () => group({ company: control(f.company) }, { type: 'card' }))  // while field visible

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

1. `node.component` (direct component reference) — highest priority
2. `node.type` resolved via registry — fallback

This applies to controls, groups, AND arrays. All options go directly on the node — there is no separate `def` layer.

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
  readonly label = input('');       // custom prop
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
  readonly title = input(''); // from bindings
}
```

### Visibility

- **Nodes mapped to a field** (controls, data-driven groups/arrays): use signal forms `hidden()` in the schema. The renderer reads `field().hidden()` automatically.
- **Layout structure** (a card around several fields, a sub-form per type): use `when()` / `switchCase()`. A branch is rebuilt only when its condition flips. `when(f.x, …)` renders while field `x` is visible, so validity conditions stay in the schema.
- Branches are layout only — fields in an inactive branch still validate. Pair with `hidden()` / `applyWhenValue()` in the schema.
- Branching on a signal inside `layout()` also works, but every re-run recreates all rendered components (dev-mode warning). Fine for rarely-changing structure (loaded config); use `when()` / `switchCase()` for anything that changes while the user types.

### Layout Composability

Layouts are plain functions — composability is free:

```typescript
function addressFields(addr: FieldTree<Address>): Record<string, LayoutNode> {
  return {
    street: control(addr.street, { type: 'text', bindings: [inputBinding('label', () => 'Street')] }),
    city: control(addr.city, { type: 'text', bindings: [inputBinding('label', () => 'City')] }),
  };
}

layout(orderForm, (f) => [
  group(f.shippingAddress, { type: 'card' }, addressFields),
  group(f.billingAddress, { type: 'card' }, addressFields),
]);
```

## Important Notes

- `FieldTree<T>` (not `Field<T>`) is the correct type from `@angular/forms/signals`
- Wrapper controls (Pattern A) use `[formField]` on their inner form element — the library passes `field` and `state` as inputs
- Custom controls (Pattern B) implement `FormValueControl<T>` — only `value = model()` is required; they also receive `field`/`state` if they declare them
- For Pattern B, `value` must be a `model()` (ModelSignal), not `input()` — it's two-way bound
- Use `protected readonly` for template-bound members, `private readonly` for internal state
- The library is UI-agnostic — bring your own components (Material, PrimeNG, custom, etc.)
- Requires Angular 22+ (signal forms)
