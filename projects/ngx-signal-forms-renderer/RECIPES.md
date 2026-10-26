# Recipes

Common form tasks with `ngx-signal-forms-renderer` and Angular Signal Forms. Each recipe is covered by
a test in [`recipes.spec.ts`](./src/lib/recipes.spec.ts), so the code here runs as written.

- [Showing and hiding: which tool](#showing-and-hiding-which-tool)
- [A sub-form per type](#a-sub-form-per-type)
- [Clearing a dependent value](#clearing-a-dependent-value)
- [Array item actions](#array-item-actions)
- [Form-level errors](#form-level-errors)
- [Submitting, and focusing the first invalid field](#submitting-and-focusing-the-first-invalid-field)
- [A file control](#a-file-control)

The recipes use two small controls, written the usual Signal Forms way:

```typescript
@Component({
  selector: 'app-text-input',
  template: `<input [value]="value()" (input)="value.set($any($event.target).value)" (blur)="touch.emit()" />`,
})
export class TextInput implements FormValueControl<string> {
  readonly value = model('');
  readonly touch = output<void>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Called by `focusBoundControl()`; without it, signal forms focuses the host element. */
  focus(options?: FocusOptions) {
    this.host.nativeElement.querySelector('input')!.focus(options);
  }
}

@Component({
  selector: 'app-select',
  template: `
    <select (change)="value.set($any($event.target).value)">
      @for (o of options(); track o) {
        <option [value]="o" [selected]="o === value()">{{ o }}</option>
      }
    </select>
  `,
})
export class SelectInput implements FormValueControl<string> {
  readonly value = model('');
  readonly options = input<string[]>([]);
}
```

## Showing and hiding: which tool

| You want to…                                                     | Use                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| hide a field (and skip its validation)                           | the schema's `hidden(path, { when })`                  |
| show a card or section while one of its fields is visible        | `when(f.field, () => section)`                         |
| show layout on a condition that isn't a field's visibility       | `when(() => condition, () => nodes, () => elseNodes)`  |
| show a different sub-form per value                              | `switchCase(f.kind, { … }, { default })` — see below   |
| show one step of a wizard                                        | `when(() => step() === n, …)`, or swap `[layout]`      |
| change structure that's decided once (loaded config, permissions) | read the signal inside `layout()`                      |

`when` and `switchCase` only rebuild a branch when the condition flips, so the user can keep typing in
the fields that drive them. Reading a signal inside `layout()` rebuilds everything it renders on every
change, which suits structure that rarely changes (a dev-mode warning says when it happens).

Wizard steps, either as one layout:

```typescript
readonly step = signal(1);
readonly l = layout(this.f, (f) => [
  when(() => this.step() === 1, () => control(f.name, { component: TextInput })),
  when(() => this.step() === 2, () => control(f.email, { component: TextInput })),
]);
```

or as one layout per step, swapped on `<sfr-form [layout]>`. Either way, the form keeps every value
— only the components are destroyed.

## A sub-form per type

A discriminated union, like a customer that is either a person or a company, needs both halves:
the **schema** decides what validates, the **layout** decides what renders. A `switchCase` branch is
layout only, so without the schema half the inactive case's required fields would keep the form
invalid, with errors nobody can see.

```typescript
type Customer = { kind: 'person' | 'company'; name: string; company: string; vatId: string };

const f = form(model, (p) => {
  applyWhenValue(p, (c) => c.kind === 'person', (s) => required(s.name));
  applyWhenValue(p, (c) => c.kind === 'company', (s) => {
    required(s.company);
    required(s.vatId);
  });
});

layout(f, (f) => [
  control(f.kind, { component: SelectInput, bindings: [inputBinding('options', () => ['person', 'company'])] }),
  switchCase(f.kind, {
    person: () => control(f.name, { component: TextInput }),
    company: () => [control(f.company, { component: TextInput }), control(f.vatId, { component: TextInput })],
  }),
]);
```

Case names are typed against the key's values: a typo like `compnay` is a type error.

## Clearing a dependent value

To clear `state` when the user picks another `country`, listen to the country control's
`valueChange` output. It fires only when the user changes the control, not when the model is loaded
or set from code, so loading a saved address doesn't wipe its state.

```typescript
control(f.country, {
  component: SelectInput,
  bindings: [
    inputBinding('options', () => countries),
    outputBinding('valueChange', () => f.state().value.set('')),
  ],
}),
control(f.state, { component: TextInput }),
```

## Array item actions

The renderer iterates an array; adding, removing and moving items is a change to the array's value.
Give each row an output, and handle it in the item layout, where the item's field is in scope:

```typescript
@Component({
  selector: 'app-item-row',
  imports: [SfrChildrenComponent],
  template: `
    <div>
      <sfr-children [children]="children()" />
      <button class="up" (click)="moveUp.emit()">Up</button>
      <button class="remove" (click)="remove.emit()">Remove</button>
    </div>
  `,
})
export class ItemRow {
  readonly children = input.required<Record<string, LayoutNode>>();
  readonly remove = output<void>();
  readonly moveUp = output<void>();
}

array(f.items, (item) =>
  group(
    item,
    {
      component: ItemRow,
      bindings: [
        // Remove by identity: the item's value is the object in the array.
        outputBinding('remove', () => {
          const removed = item().value();
          f.items().value.update((items) => items.filter((i) => i !== removed));
        }),
        // Move by index: read it when the action runs (it changes as rows move), and convert it —
        // keyInParent() is a string at runtime despite its number type.
        outputBinding('moveUp', () => {
          const index = Number(item().keyInParent());
          if (index > 0) f.items().value.update((items) => swap(items, index, index - 1));
        }),
      ],
    },
    (g) => ({ name: control(g.name, { component: TextInput }) }),
  ),
);

// Add: append a new object.
f.items().value.update((items) => [...items, { name: '' }]);

function swap<T>(items: T[], a: number, b: number): T[] {
  const copy = [...items];
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
}
```

Rows the action doesn't touch keep their components (and focus) because signal forms tracks array
items by object identity. Keep it that way:

- **Use arrays of objects.** Arrays of primitives (`string[]`) are tracked by index, so removing an
  item shifts every row after it.
- **Keep the item objects.** Filter, spread, or reorder the same objects; `structuredClone` or a JSON
  round-trip creates new ones, and every row is recreated.
- **Read the item's key or value when the action runs**, not ahead of time. A removed item's field is
  orphaned, and `keyInParent()` throws on it.

## Form-level errors

A `content()` node renders a component that isn't bound to a field. Bind it to the form's `errorSummary()` and it updates in place:

```typescript
@Component({
  selector: 'app-error-summary',
  template: `
    @if (errors().length) {
      <ul role="alert">
        @for (e of errors(); track $index) {
          <li>{{ e.message }}</li>
        }
      </ul>
    }
  `,
})
export class ErrorSummary {
  readonly errors = input<ValidationError[]>([]);
}

layout(f, (f) => [
  control(f.name, { component: TextInput }),
  control(f.email, { component: TextInput }),
  content(ErrorSummary, { bindings: [inputBinding('errors', () => f().errorSummary())] }),
]);
```

Use `f().errors()` instead to show only errors on the form itself (from `validateTree` or a submit
action), or a group/array wrapper's `state` input for a section's errors.

## Submitting, and focusing the first invalid field

The renderer doesn't own submission: put `<sfr-form>` inside a `<form [formRoot]>` and declare the
submission on the form. On submit, signal forms marks every field touched, then runs `action` if the
form is valid or `onInvalid` if it isn't.

```typescript
@Component({
  imports: [SfrFormComponent, FormRoot],
  template: `
    <form [formRoot]="f">
      <sfr-form [layout]="l" />
      <button type="submit">Save</button>
    </form>
  `,
})
export class SignupForm {
  readonly model = signal({ name: '', email: '' });
  readonly f = form(
    this.model,
    (p) => {
      required(p.name);
      required(p.email);
    },
    {
      submission: {
        action: async (f) => {
          await this.api.save(f().value());
          return undefined; // or validation errors returned by the server
        },
        onInvalid: (f) => f().errorSummary()[0]?.fieldTree().focusBoundControl(),
      },
    },
  );
  readonly l = layout(this.f, (f) => [
    control(f.name, { component: TextInput }),
    control(f.email, { component: TextInput }),
  ]);
}
```

`focusBoundControl()` calls the control's `focus()` method (see `TextInput` above), or focuses its host
element if it has none. Errors are listed in field order, which matches the layout when the layout
follows the model. Outside a `<form>`, call `submit(f, action)` from code.

## A file control

A file input is a `FormValueControl<File | null>` like any other:

```typescript
@Component({
  selector: 'app-file-input',
  template: `<input type="file" [accept]="accept()" (change)="pick($event)" (blur)="touch.emit()" />`,
})
export class FileInput implements FormValueControl<File | null> {
  readonly value = model<File | null>(null);
  readonly touch = output<void>();
  readonly accept = input('');

  pick(event: Event) {
    this.value.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }
}

control(f.avatar, { component: FileInput, bindings: [inputBinding('accept', () => 'image/*')] });
```

A browser never lets code set a file input's selection, so the control can't show a file that was set
in the model. To clear the input when the form resets, have the control clear its `<input>` when
`value()` becomes `null`. Upload the `File` in the submit `action` (for example as `FormData`).
