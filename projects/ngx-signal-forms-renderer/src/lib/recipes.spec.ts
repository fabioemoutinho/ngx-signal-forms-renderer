/**
 * One test per recipe in RECIPES.md. The components and layouts below are the recipes' code, so
 * keep the two in sync.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  Component,
  ElementRef,
  inject,
  input,
  inputBinding,
  model,
  output,
  outputBinding,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  applyWhenValue,
  form,
  FormRoot,
  FormValueControl,
  required,
  submit,
  ValidationError,
} from '@angular/forms/signals';
import { array, content, control, group, layout, LayoutSignal, switchCase, when } from './layout';
import { SfrChildrenComponent } from './children.component';
import { SfrFormComponent } from './sfr-form.component';
import { LayoutNode } from './layout-types';
import { created, renderForm, resetTracking } from './testing/harness';

beforeEach(() => resetTracking());

afterEach(() => vi.restoreAllMocks());

// ── Shared recipe components ─────────────────────────────────────────────

/** A text control implementing FormValueControl, focusable through signal forms. */
@Component({
  selector: 'app-text-input',
  template: `<input [value]="value()" (input)="value.set($any($event.target).value)" (blur)="touch.emit()" />`,
})
class TextInput implements FormValueControl<string> {
  readonly value = model('');
  readonly touch = output<void>();
  private readonly input = inject<ElementRef<HTMLElement>>(ElementRef);
  focus(options?: FocusOptions) {
    this.input.nativeElement.querySelector('input')!.focus(options);
  }
}

/** A select control. */
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
class SelectInput implements FormValueControl<string> {
  readonly value = model('');
  readonly options = input<string[]>([]);
}

const typeInto = (el: HTMLElement, selector: string, value: string) => {
  const input = el.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
};

// ── Discriminated unions: switchCase + applyWhenValue ────────────────────

describe('recipe: sub-form per type (switchCase + applyWhenValue)', () => {
  type Customer = { kind: 'person' | 'company'; name: string; company: string; vatId: string };

  it('validates only the active case, and renders only its fields', async () => {
    const { host, act, fixture } = await renderForm(
      { kind: 'person', name: 'Ada', company: '', vatId: '' } as Customer,
      (f) => [
        control(f.kind, { component: SelectInput, bindings: [inputBinding('options', () => ['person', 'company'])] }),
        switchCase(f.kind, {
          person: () => control(f.name, { component: TextInput }),
          company: () => [control(f.company, { component: TextInput }), control(f.vatId, { component: TextInput })],
        }),
      ],
      {
        schema: (p) => {
          applyWhenValue(p, (c) => c.kind === 'person', (s) => required(s.name));
          applyWhenValue(p, (c) => c.kind === 'company', (s) => {
            required(s.company);
            required(s.vatId);
          });
        },
      },
    );
    const el: HTMLElement = fixture.nativeElement;
    expect(host.f().valid()).toBe(true);
    expect(el.querySelectorAll('app-text-input')).toHaveLength(1);

    await act(() => typeInto(el, 'select', 'company'));

    expect(host.f().valid()).toBe(false);
    expect(el.querySelectorAll('app-text-input')).toHaveLength(2);
  });
});

// ── Clearing dependent values ────────────────────────────────────────────

describe('recipe: clearing a dependent value when the user changes another', () => {
  it('clears on user edits only, not when the model is loaded or set in code', async () => {
    const { host, act, fixture } = await renderForm({ country: 'US', state: 'CA' }, (f) => [
      control(f.country, {
        component: SelectInput,
        bindings: [
          inputBinding('options', () => ['US', 'CA']),
          outputBinding('valueChange', () => f.state().value.set('')),
        ],
      }),
      control(f.state, { component: TextInput }),
    ]);

    await act(() => host.model.set({ country: 'CA', state: 'ON' }));
    expect(host.model().state).toBe('ON');

    await act(() => typeInto(fixture.nativeElement, 'select', 'US'));
    expect(host.model()).toEqual({ country: 'US', state: '' });
  });
});

// ── Array item actions ───────────────────────────────────────────────────

/** Row wrapper with a remove button: it only emits, the layout decides what removing means. */
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
class ItemRow {
  readonly children = input.required<Record<string, LayoutNode>>();
  readonly remove = output<void>();
  readonly moveUp = output<void>();
}

/** Returns a copy of `items` with the items at `a` and `b` swapped (same objects, new order). */
function swap<T>(items: T[], a: number, b: number): T[] {
  const copy = [...items];
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
}

describe('recipe: array item actions (add, remove, move)', () => {
  type Item = { name: string };

  it('removes, adds and moves items without recreating the other rows', async () => {
    const { host, act, fixture } = await renderForm(
      { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] as Item[] },
      (f) => [
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
                // Move by index: read it when the action runs (it changes as rows move), and
                // convert it — keyInParent() is a string at runtime despite its number type.
                outputBinding('moveUp', () => {
                  const index = Number(item().keyInParent());
                  if (index > 0) f.items().value.update((items) => swap(items, index, index - 1));
                }),
              ],
            },
            (g) => ({ name: control(g.name, { component: TextInput }) }),
          ),
        ),
      ],
    );
    const rows = () => fixture.debugElement.queryAll(By.directive(TextInput)).map((d) => d.componentInstance);
    const [a, , c] = rows();

    const click = (selector: string, row: number) =>
      act(() => (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(selector)[row].click());
    const names = () => host.model().items.map((i) => i.name);

    await click('.remove', 1);
    expect(names()).toEqual(['a', 'c']);
    expect(rows()).toEqual([a, c]);

    await click('.up', 1);
    expect(names()).toEqual(['c', 'a']);
    expect(rows()).toEqual([c, a]);

    // Add: append a new object; the existing rows are kept.
    await act(() => host.f.items().value.update((items) => [...items, { name: 'd' }]));
    expect(names()).toEqual(['c', 'a', 'd']);
    expect(rows().slice(0, 2)).toEqual([c, a]);
  });
});

// ── Form-level errors ────────────────────────────────────────────────────

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
class ErrorSummary {
  readonly errors = input<ValidationError[]>([]);
}

describe('recipe: form-level errors (content)', () => {
  it('lists the errors and updates in place', async () => {
    const { host, act, fixture } = await renderForm(
      { name: '', email: '' },
      (f) => [
        control(f.name, { component: TextInput }),
        control(f.email, { component: TextInput }),
        content(ErrorSummary, { bindings: [inputBinding('errors', () => f().errorSummary())] }),
      ],
      {
        schema: (p) => {
          required(p.name, { message: 'Name is required' });
          required(p.email, { message: 'Email is required' });
        },
      },
    );
    const items = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li')).map((li) => li.textContent);
    expect(items()).toEqual(['Name is required', 'Email is required']);
    const summaries = created.length;

    await act(() => host.f.name().value.set('Ada'));

    expect(items()).toEqual(['Email is required']);
    expect(created).toHaveLength(summaries);
  });
});

// ── Submitting with <form [formRoot]>, focusing the first error ──────────

describe('recipe: submitting, and focusing the first invalid field', () => {
  @Component({
    imports: [SfrFormComponent, FormRoot],
    template: `
      <form [formRoot]="f">
        <sfr-form [layout]="l" />
        <button type="submit">Save</button>
      </form>
    `,
  })
  class SignupForm {
    readonly saved = signal<unknown>(null);
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
            this.saved.set(f().value());
            return undefined;
          },
          onInvalid: (f) => f().errorSummary()[0]?.fieldTree().focusBoundControl(),
        },
      },
    );
    readonly l: LayoutSignal = layout(this.f, (f) => [
      control(f.name, { component: TextInput }),
      control(f.email, { component: TextInput }),
    ]);
  }

  it('focuses the first invalid control when invalid, and submits the values when valid', async () => {
    const fixture = TestBed.createComponent(SignupForm);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const inputs = el.querySelectorAll('input');
    const save = () => el.querySelector('button')!.click();

    typeInto(el, 'app-text-input input', 'Ada');
    save();
    await fixture.whenStable();
    expect(document.activeElement).toBe(inputs[1]);
    expect(fixture.componentInstance.f.email().touched()).toBe(true);
    expect(fixture.componentInstance.saved()).toBeNull();

    inputs[1].value = 'ada@example.com';
    inputs[1].dispatchEvent(new Event('input'));
    save();
    await fixture.whenStable();
    expect(fixture.componentInstance.saved()).toEqual({ name: 'Ada', email: 'ada@example.com' });
    fixture.nativeElement.remove();
  });

  it('works with submit() from code, outside a <form>', async () => {
    const action = vi.fn(async () => undefined);
    const f = TestBed.runInInjectionContext(() => form(signal({ name: 'Ada' })));

    await submit(f, action);

    expect(action).toHaveBeenCalledOnce();
  });
});

// ── File control ─────────────────────────────────────────────────────────

/** A FormValueControl<File | null> around a native file input. */
@Component({
  selector: 'app-file-input',
  template: `<input type="file" [accept]="accept()" (change)="pick($event)" (blur)="touch.emit()" />`,
})
class FileInput implements FormValueControl<File | null> {
  readonly value = model<File | null>(null);
  readonly touch = output<void>();
  readonly accept = input('');

  pick(event: Event) {
    this.value.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }
}

describe('recipe: file control', () => {
  it('writes the picked file into the form', async () => {
    const { host, act, fixture } = await renderForm({ avatar: null as File | null }, (f) => [
      control(f.avatar, { component: FileInput, bindings: [inputBinding('accept', () => 'image/*')] }),
    ]);
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });

    await act(() => input.dispatchEvent(new Event('change')));

    expect(input.accept).toBe('image/*');
    expect(host.model().avatar).toBe(file);
  });
});

// ── Showing and hiding: which tool ───────────────────────────────────────

describe('recipe: steps by swapping the layout', () => {
  it('renders one step at a time; the form keeps every value', async () => {
    const { host, swapLayout, fixture } = await renderForm({ name: 'Ada', email: 'a@b.c' }, (f) => [
      control(f.name, { component: TextInput }),
    ]);
    const values = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('input')).map((i) => i.value);
    expect(values()).toEqual(['Ada']);

    await swapLayout((f) => [control(f.email, { component: TextInput })]);

    expect(values()).toEqual(['a@b.c']);
    expect(host.model()).toEqual({ name: 'Ada', email: 'a@b.c' });
  });

  it('or, within one layout, with when() on a step signal', async () => {
    const step = signal(1);
    const { act, fixture } = await renderForm({ name: 'Ada', email: 'a@b.c' }, (f) => [
      when(() => step() === 1, () => control(f.name, { component: TextInput })),
      when(() => step() === 2, () => control(f.email, { component: TextInput })),
    ]);
    const values = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('input')).map((i) => i.value);

    await act(() => step.set(2));

    expect(values()).toEqual(['a@b.c']);
  });
});
