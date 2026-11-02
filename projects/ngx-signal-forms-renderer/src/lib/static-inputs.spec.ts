import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  Component,
  computed,
  Directive,
  inject,
  input,
  inputBinding,
  model,
  signal,
  Type,
} from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FieldTree, FormValueControl, max } from '@angular/forms/signals';
import { array, content, control, group, when } from './layout';
import { provideSignalFormsRenderer } from './provider';
import { resolveStaticInputs } from './static-inputs';
import {
  CardWrapper,
  created,
  items,
  ListWrapper,
  MarkerDirective,
  renderForm,
  resetTracking,
  spyWarn,
  TextContent,
  TrackedControl,
} from './testing/harness';

beforeEach(() => resetTracking());

afterEach(() => vi.restoreAllMocks());

// ── Test components ────────────────────────────────────────────────────────
// Static-input warnings are deduplicated per component class and message, so a test that counts
// one builds its own class (the `fresh…()` factories): the count then holds on a retry or repeat
// too.

/** Plain control with a defaulted input, an aliased one and a constraint-named one. */
@Component({ selector: 'test-inputs-control', template: '' })
class InputsControl {
  readonly field = input.required<FieldTree<string>>();
  readonly label = input('default');
  readonly size = input(5, { alias: 'sizeValue' });
  readonly required = input(false);
}

/** Form control whose `max` input is aliased away, and whose `limit` input is aliased to `max`. */
@Component({ selector: 'test-aliased-range', template: '' })
class AliasedRange {
  readonly value = model<number | null>(null);
  readonly limit = input<number | undefined>(undefined, { alias: 'max' });
  readonly max = input(0, { alias: 'ceiling' });
}

/** Control with a `model()` input the component itself changes. */
@Component({ selector: 'test-toggle', template: '' })
class Toggle {
  readonly field = input<unknown>();
  readonly open = model(false);
}

@Directive({ selector: '[testColor]' })
class ColorDirective {
  readonly color = input('none');
}

/** Exposes a host directive's input. */
@Component({
  selector: 'test-colored',
  template: '{{ dir.color() }}',
  hostDirectives: [{ directive: ColorDirective, inputs: ['color'] }],
})
class Colored {
  readonly dir = inject(ColorDirective);
}

/** A directive added through `directives`. */
@Directive({ selector: '[testTone]' })
class ToneDirective {
  readonly tone = input('none');
  readonly disabled = input(false);
}

/** Renderer-owned array component with a label. */
@Component({ selector: 'test-labeled-list', template: '{{ label() }}' })
class LabeledList {
  readonly field = input.required<FieldTree<{ name: string }[]>>();
  readonly label = input('');
}

/** A plain control class of the test's own (not a form control). */
function freshControl() {
  @Component({ selector: 'test-fresh-control', template: '' })
  class FreshControl {
    readonly field = input<unknown>();
    readonly label = input<unknown>();
    readonly hint = input<unknown>();
  }
  return FreshControl;
}

/** A custom form control class of the test's own, declaring inputs `FormField` sets. */
function freshRange() {
  @Component({ selector: 'test-fresh-range', template: '' })
  class FreshRange implements FormValueControl<number | null> {
    readonly value = model<number | null>(null);
    readonly field = input<unknown>();
    readonly max = input<number | undefined>(undefined);
    readonly disabled = input(false);
    readonly dirty = input(false);
    readonly label = input<unknown>();
    readonly hint = input<unknown>();
  }
  return FreshRange;
}

/** A directive class of the test's own. */
function freshTone() {
  @Directive({ selector: '[testFreshTone]' })
  class FreshTone {
    readonly tone = input<unknown>('none');
    readonly disabled = input(false);
    readonly value = input<unknown>();
  }
  return FreshTone;
}

/** The instance of directive `type` on the rendered component. */
const directiveOf = <D>(fixture: ComponentFixture<unknown>, type: Type<D>): D =>
  fixture.debugElement.query(By.directive(type)).injector.get(type);

const providers = [provideSignalFormsRenderer({ components: { inputs: InputsControl, colored: Colored } })];

// ── Resolving names (isolated) ─────────────────────────────────────────────

describe('resolveStaticInputs', () => {
  it('skips undefined values and keeps null', () => {
    const { bind } = resolveStaticInputs({ a: undefined, b: null, c: 0 }, {});
    expect(bind).toEqual([
      { name: 'b', key: 'b' },
      { name: 'c', key: 'c' },
    ]);
  });

  it('binds a property name under its public name, and any other name as written', () => {
    const publicNames = new Map([['size', 'sizeValue']]);
    const { bind } = resolveStaticInputs({ size: 3, sizeValue: 4, other: 5 }, { publicNames });
    expect(bind).toEqual([
      { name: 'sizeValue', key: 'size' },
      { name: 'sizeValue', key: 'sizeValue' },
      { name: 'other', key: 'other' },
    ]);
  });

  it("drops the renderer's names, and FormField's only when FormField is attached", () => {
    const inputs = { field: 'x', max: 9, label: 'L' };
    const reserved = new Set(['field']);
    const plain = resolveStaticInputs(inputs, { reserved });
    const control = resolveStaticInputs(inputs, { reserved, formField: 'control' });

    expect(plain.bind.map((b) => b.key)).toEqual(['max', 'label']);
    expect(plain.ignored).toEqual(["'field': bound by the renderer (remove it)"]);
    expect(control.bind.map((b) => b.key)).toEqual(['label']);
    expect(control.ignored[1]).toContain("'max': set by the FormField directive");
  });

  it("says why each of FormField's inputs is dropped, and what to do instead", () => {
    const { ignored } = resolveStaticInputs(
      { value: 1, checked: true, disabled: true, minLength: 2, dirty: true, name: 'n' },
      { formField: 'control' },
    );
    expect(ignored).toEqual([
      "'value': reserved for the FormField directive's model binding (the value comes from the form model; an unrelated input needs another name)",
      "'checked': reserved for the FormField directive's model binding (the value comes from the form model; an unrelated input needs another name)",
      "'disabled': set by the FormField directive from the field's state (use the disabled() rule in the form's schema)",
      "'minLength': set by the FormField directive from the field's state (use the minLength() rule in the form's schema)",
      "'dirty': set by the FormField directive from the field's state (Angular computes it from the field)",
      "'name': set by the FormField directive from the field's state (Angular computes it from the field)",
    ]);
  });

  it("keeps value and checked on another directive: FormField sets those only on the control", () => {
    const { bind, ignored } = resolveStaticInputs({ value: 'v', checked: true, disabled: true }, { formField: 'directive' });
    expect(bind.map((b) => b.key)).toEqual(['value', 'checked']);
    expect(ignored).toEqual([
      "'disabled': set by the FormField directive from the field's state (use the disabled() rule in the form's schema)",
    ]);
  });

  it('gives the hint for the public name an aliased input is dropped under', () => {
    const { ignored } = resolveStaticInputs({ limit: 3 }, { publicNames: new Map([['limit', 'max']]), formField: 'control' });
    expect(ignored).toEqual([
      "'limit': set by the FormField directive from the field's state (use the max() rule in the form's schema)",
    ]);
  });

  it('drops a reserved input by its public name, and does not list a dropped signal', () => {
    const { bind, ignored, signals } = resolveStaticInputs(
      { tree: signal('x') },
      { publicNames: new Map([['tree', 'field']]), reserved: new Set(['field']) },
    );
    expect(bind).toEqual([]);
    expect(ignored).toEqual(["'tree': bound by the renderer (remove it)"]);
    expect(signals).toEqual([]);
  });

  it('lists signal values, which are still bound as the value', () => {
    const { bind, signals } = resolveStaticInputs({ label: signal('x'), size: 1 }, {});
    expect(bind.map((b) => b.key)).toEqual(['label', 'size']);
    expect(signals).toEqual(['label']);
  });

  it('reads values untracked, so reading inputs never creates a dependency', () => {
    const value = signal('a');
    const inputs = {
      get label() {
        return value();
      },
    };
    let runs = 0;
    const resolved = computed(() => {
      runs++;
      return resolveStaticInputs(inputs, {});
    });
    resolved();
    value.set('b');
    resolved();
    expect(runs).toBe(1);
  });
});

// ── Binding ───────────────────────────────────────────────────────────────

describe('static inputs', () => {
  it('binds static inputs alongside the reserved field binding', async () => {
    const { host, all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: InputsControl, inputs: { label: 'Name' } }),
    ]);

    const [c] = all(InputsControl);
    expect(c.label()).toBe('Name');
    expect(c.field()).toBe(host.f.name);
  });

  it('binds an aliased input by its property name', async () => {
    const { all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: InputsControl, inputs: { size: 3 } }),
    ]);
    expect(all(InputsControl)[0].size()).toBe(3);
  });

  it('also accepts the public name, for a registry key (whose inputs are untyped)', async () => {
    const { all } = await renderForm(
      { name: 'Ada' },
      (f) => [control(f.name, { component: 'inputs', inputs: { sizeValue: 3 } })],
      { providers },
    );
    expect(all(InputsControl)[0].size()).toBe(3);
  });

  it('skips undefined values, so the input keeps its default', async () => {
    const { all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: InputsControl, inputs: { label: undefined } }),
    ]);
    expect(all(InputsControl)[0].label()).toBe('default');
  });

  it('reads each value inside its binding: a signal read through inputs never recreates the component', async () => {
    const label = signal('A');
    const inputs = {
      get label() {
        return label();
      },
    };
    const { act, all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl, inputs }),
    ]);
    const [before] = all(TrackedControl);

    await act(() => label.set('B'));
    const after = all(TrackedControl);
    expect(after).toHaveLength(1);
    expect(after[0]).toBe(before);
    expect(created.length).toBe(1);
  });

  it('passes a signal as the value itself, with one dev-mode warning naming the input', async () => {
    const { count } = spyWarn();
    const Control = freshControl();
    const label = signal('x');
    const { all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: Control, inputs: { label } }),
      control(f.name, { component: Control, inputs: { label } }),
    ]);
    expect(all(Control)[0].label()).toBe(label);
    expect(count("Signals passed as static input values: 'label'")).toBe(1);
    expect(count("use bindings: [inputBinding('label', signal)]")).toBe(1);
  });

  it("points a directive entry's signal to the entry's own bindings", async () => {
    const { count } = spyWarn();
    const Tone = freshTone();
    await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl, directives: [{ type: Tone, inputs: { tone: signal('warm') } }] }),
    ]);
    expect(count("the directive must read. To bind its value instead, use the directive entry's bindings: [inputBinding('tone', signal)]")).toBe(1);
  });

  it('lets a binding override a static input, and keeps it reactive', async () => {
    const label = signal('B');
    const { act, all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, {
        component: InputsControl,
        inputs: { label: 'A' },
        bindings: [inputBinding('label', label)],
      }),
    ]);
    const [c] = all(InputsControl);
    expect(c.label()).toBe('B');

    await act(() => label.set('C'));
    expect(c.label()).toBe('C');
  });

  it('sets a model() input once: a change the component makes is kept', async () => {
    const { host, act, all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: Toggle, inputs: { open: true } }),
    ]);
    const [c] = all(Toggle);
    expect(c.open()).toBe(true);

    await act(() => c.open.set(false));
    await act(() => host.model.set({ name: 'Grace' }));
    const now = all(Toggle);
    expect(now).toHaveLength(1);
    expect(now[0]).toBe(c);
    expect(c.open()).toBe(false);
  });

  it('binds static inputs on wrappers and content nodes', async () => {
    const { all } = await renderForm({ name: 'Ada' }, (f) => [
      group({ name: control(f.name, { component: TrackedControl }) }, { component: CardWrapper, inputs: { title: 'Info' } }),
      content(TextContent, { inputs: { text: 'Hi' } }),
    ]);
    expect(all(CardWrapper)[0].title()).toBe('Info');
    expect(all(TextContent)[0].text()).toBe('Hi');
  });

  it('binds static inputs on every kind of array, its empty node and its items', async () => {
    const { host, act, all } = await renderForm({ items: items() }, (f) => [
      array(f.items, { component: LabeledList, inputs: { label: 'Owned' } }),
      array(
        f.items,
        { component: ListWrapper, inputs: { label: 'Iterated' }, empty: content(TextContent, { inputs: { text: 'none' } }) },
        (item) => control(item.name, { component: TrackedControl, inputs: { label: 'row' } }),
      ),
    ]);
    expect(all(LabeledList)[0].label()).toBe('Owned');
    expect(all(ListWrapper)[0].label()).toBe('Iterated');
    expect(all(TextContent)[0].text()).toBe('none');

    await act(() => host.model.set({ items: items('a', 'b') }));
    expect(all(TrackedControl).map((c) => c.label())).toEqual(['row', 'row']);
  });

  it("keeps a content node's field, state and children inputs: the renderer binds none there", async () => {
    const { all } = await renderForm({}, () => [content('text', { inputs: { state: 's' } })], {
      providers: [provideSignalFormsRenderer({ components: { text: TextContent } })],
    });
    expect(all(TextContent)[0].state()).toBe('s');
  });

  it('keeps constraint-named inputs on a component that is not a form control', async () => {
    const { warn } = spyWarn();
    const { all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: InputsControl, inputs: { required: true } }),
    ]);
    expect(all(InputsControl)[0].required()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not recreate the component when the field value changes', async () => {
    const { host, expectStable } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl, inputs: { label: 'Name' } }),
    ]);
    await expectStable(() => host.model.set({ name: 'Grace' }));
  });
});

// ── Directives ────────────────────────────────────────────────────────────

describe('static inputs and directives', () => {
  it("reaches an input the component exposes from its own hostDirectives", async () => {
    const { fixture } = await renderForm(
      { name: 'Ada' },
      (f) => [control(f.name, { component: 'colored', inputs: { color: 'red' } })],
      { providers },
    );
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('red');
  });

  it("binds a directive entry's inputs to that directive", async () => {
    const { fixture } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, {
        component: TrackedControl,
        directives: [{ type: ToneDirective, inputs: { tone: 'warm', disabled: true } }],
      }),
    ]);
    const tone = directiveOf(fixture, ToneDirective);
    expect([tone.tone(), tone.disabled()]).toEqual(['warm', true]);
  });

  it("applies a directive entry's bindings after its inputs, so they win", async () => {
    const { fixture } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, {
        component: TrackedControl,
        directives: [
          { type: ToneDirective, inputs: { tone: 'warm' }, bindings: [inputBinding('tone', () => 'cold')] },
        ],
      }),
    ]);
    expect(directiveOf(fixture, ToneDirective).tone()).toBe('cold');
  });

  it("ignores FormField's inputs on a form control's directive entry, with a dev-mode warning", async () => {
    const { count } = spyWarn();
    const Tone = freshTone();
    const { fixture } = await renderForm({ age: 5 as number | null }, (f) => [
      control(f.age, {
        component: freshRange(),
        directives: [{ type: Tone, inputs: { tone: 'warm', disabled: true, value: 'kept' } }],
      }),
    ]);
    const tone = directiveOf(fixture, Tone);
    expect([tone.tone(), tone.disabled(), tone.value()]).toEqual(['warm', false, 'kept']);
    expect(count("'disabled': set by the FormField directive")).toBe(1);
    expect(count("'value'")).toBe(0);
  });

  it("keeps FormField's names outside a control node, where FormField isn't attached", async () => {
    const Range = freshRange();
    const { fixture, all } = await renderForm({}, () => [
      content(Range, {
        inputs: { max: 3 },
        directives: [{ type: ToneDirective, inputs: { disabled: true } }],
      }),
    ]);
    expect(all(Range)[0].max()).toBe(3);
    expect(directiveOf(fixture, ToneDirective).disabled()).toBe(true);
  });

  it('leaves names no target declares to Angular, which throws NG0315 in dev mode', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      renderForm({ name: 'Ada' }, (f) => [control(f.name, { component: 'inputs', inputs: { nope: 1 } })], {
        providers,
      }),
    ).rejects.toThrow(/NG0315/);
  });
});

// ── Ignored inputs and warnings ───────────────────────────────────────────

describe('static inputs the renderer ignores', () => {
  it('ignores inputs FormField sets on a form control, with one dev-mode warning', async () => {
    const { count } = spyWarn();
    const Range = freshRange();
    const { all } = await renderForm(
      { age: 5 as number | null },
      (f) => [control(f.age, { component: Range, inputs: { max: 99, label: 'Age' } })],
      { schema: (p) => max(p.age, 10) },
    );

    const [c] = all(Range);
    expect(c.max()).toBe(10);
    expect(c.label()).toBe('Age');
    expect(count("'max': set by the FormField directive")).toBe(1);
  });

  it("goes by public name: an input aliased to FormField's name is ignored, one aliased away is bound", async () => {
    const { all } = await renderForm(
      { age: 5 as number | null },
      (f) => [control(f.age, { component: AliasedRange, inputs: { limit: 99, max: 7 } })],
      { schema: (p) => max(p.age, 10) },
    );
    const [c] = all(AliasedRange);
    expect([c.limit(), c.max()]).toEqual([10, 7]);
  });

  it('ignores inputs the renderer binds itself, with a dev-mode warning', async () => {
    const { count } = spyWarn();
    const Control = freshControl();
    const { host, all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: Control, inputs: { field: 'not a field' } }),
    ]);
    expect(all(Control)[0].field()).toBe(host.f.name);
    expect(count("'field': bound by the renderer (remove it)")).toBe(1);
  });

  it('lists every ignored input and every signal, each warning logging the node', async () => {
    const { warn, count } = spyWarn();
    const { fixture } = await renderForm({ age: 5 as number | null }, (f) => [
      control(f.age, {
        component: freshRange(),
        inputs: { field: 'x', max: 1, label: signal('a'), hint: signal('b') },
      }),
    ]);
    expect(count("'field': bound by the renderer (remove it); 'max': set by the FormField directive")).toBe(1);
    expect(count("Signals passed as static input values: 'label', 'hint'")).toBe(1);
    const node = fixture.nativeElement.querySelector('sfr-node');
    expect(warn.mock.calls.map((args) => args[1])).toEqual([node, node]);
  });

  it('warns once per component, not once per array item', async () => {
    const { count } = spyWarn();
    const { host, act } = await renderForm(
      { items: items('a', 'b', 'c') },
      (f) => [array(f.items, (item) => control(item.name, { component: 'item', inputs: { field: 'x' } }))],
      { providers: [provideSignalFormsRenderer({ components: { item: freshControl() } })] },
    );
    await act(() => host.model.set({ items: items('a', 'b', 'c', 'd') }));
    expect(count('Static inputs ignored')).toBe(1);
  });

  it('warns once per component, not on every rebuild of a when() branch', async () => {
    const { count } = spyWarn();
    const show = signal(true);
    const { act } = await renderForm(
      { name: 'Ada' },
      (f) => [when(show, () => control(f.name, { component: 'branch', inputs: { field: 'x' } }))],
      { providers: [provideSignalFormsRenderer({ components: { branch: freshControl() } })] },
    );
    await act(() => show.set(false));
    await act(() => show.set(true));
    expect(count('Static inputs ignored')).toBe(1);
  });

  it('warns for each component, even when two nodes share one inputs object', async () => {
    const { count } = spyWarn();
    const inputs = { field: 'x' };
    await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: freshControl(), inputs }),
      control(f.name, { component: freshControl(), inputs }),
    ]);
    expect(count('Static inputs ignored')).toBe(2);
  });

  it.each([
    ['inputs', { inputs: { title: 'lost' } }],
    ['bindings', { bindings: [inputBinding('title', () => 'lost')] }],
    ['directives', { directives: [MarkerDirective] }],
  ])('warns when a group has %s but no component to receive them', async (_, options) => {
    const { count } = spyWarn();
    await renderForm({ name: 'Ada' }, (f) => [
      group({ name: control(f.name, { component: TrackedControl }) }, options),
    ]);
    expect(count("A group node has inputs, bindings or directives but no 'component' to receive them")).toBe(1);
  });

  it('warns the same for an array without a component', async () => {
    const { count } = spyWarn();
    await renderForm({ items: items('a') }, (f) => [
      array(f.items, { inputs: { label: 'lost' } }, (item) => control(item.name, { component: TrackedControl })),
    ]);
    expect(count("An array node has inputs, bindings or directives but no 'component'")).toBe(1);
  });

  it('warns once for the same mistake on several nodes, logging the first node', async () => {
    const { warn } = spyWarn();
    const { fixture } = await renderForm({ name: 'Ada' }, (f) => [
      group({ a: control(f.name, { component: TrackedControl }) }, { inputs: { title: 'lost' } }),
      group({ b: control(f.name, { component: TrackedControl }) }, { inputs: { title: 'lost' } }),
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toBe(fixture.nativeElement.querySelector('sfr-node'));
  });

  it('says an unregistered group key also drops its inputs', async () => {
    const { count } = spyWarn();
    await renderForm({ name: 'Ada' }, (f) => [
      group({ name: control(f.name, { component: TrackedControl }) }, { component: 'card', inputs: { title: 'lost' } }),
    ]);
    expect(
      count("Component 'card' is not registered, so this group node renders its children without a wrapper, and its inputs"),
    ).toBe(1);
  });

  it.each([
    ['empty', {}],
    ['all undefined', { title: undefined }],
  ])('does not warn for a group without a component whose inputs are %s', async (_, inputs) => {
    const { warn } = spyWarn();
    await renderForm({ name: 'Ada' }, (f) => [group({ name: control(f.name, { component: TrackedControl }) }, { inputs })]);
    expect(warn).not.toHaveBeenCalled();
  });
});
