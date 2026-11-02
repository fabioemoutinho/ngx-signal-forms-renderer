import { describe, it, expect, expectTypeOf } from 'vitest';
import { booleanAttribute, Component, computed, Directive, Input, input, inputBinding, model, numberAttribute, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';
import { control, group, array, content, layout } from './layout';
import { ComponentSignalInputs, LayoutNodeOptions } from './layout-types';

function mockFieldTree<T>(value: T): any {
  const state = {
    value: signal(value),
    hidden: signal(false),
    touched: signal(false),
    dirty: signal(false),
    disabled: signal(false),
    readonly: signal(false),
    required: signal(false),
    valid: signal(true),
    invalid: signal(false),
    pending: signal(false),
    errors: signal([]),
    errorSummary: signal([]),
    name: signal('test'),
    pattern: signal([]),
    submitting: signal(false),
    disabledReasons: signal([]),
    keyInParent: signal(''),
    formFieldBindings: signal([]),
    controlValue: signal(value),
    markAsTouched: () => {},
    markAsDirty: () => {},
    metadata: () => undefined,
    reset: () => {},
    focusBoundControl: () => {},
  };
  // Use a Proxy so child fields can be assigned (arrow fn `name` is non-writable)
  const extras: Record<string | symbol, unknown> = {};
  const fn = () => state;
  return new Proxy(fn, {
    set(_target, key, val) { extras[key as string] = val; return true; },
    get(target, key) { return key in extras ? extras[key as string] : (target as any)[key]; },
  });
}

describe('control()', () => {
  it('should create a ControlNode with kind "control"', () => {
    const f = mockFieldTree('hello');
    const node = control(f);
    expect(node.kind).toBe('control');
    expect(node.field).toBe(f);
    expect(node.component).toBeUndefined();
  });

  it('should create a ControlNode with options', () => {
    const f = mockFieldTree('hello');
    const node = control(f, { component: 'text', bindings: [inputBinding('label', () => 'Name')] });
    expect(node.kind).toBe('control');
    expect(node.component).toBe('text');
    expect(node.bindings?.length).toBe(1);
  });

  it("keeps the control's own field when options built elsewhere carry one", () => {
    const own = mockFieldTree('');
    const options = { component: 'text', field: mockFieldTree('other') };
    expect(control(own, options).field).toBe(own);
  });

  it('should support component in options', () => {
    const f = mockFieldTree('');
    class MyComp {}
    const node = control(f, { component: MyComp as any });
    expect(node.component).toBe(MyComp);
  });
});

describe('group()', () => {
  it('should create a GroupNode with explicit children', () => {
    const f1 = mockFieldTree('a');
    const f2 = mockFieldTree('b');
    const node = group({ a: control(f1), b: control(f2) });
    expect(node.kind).toBe('group');
    expect(Object.keys(node.children)).toEqual(['a', 'b']);
    expect(node.component).toBeUndefined();
  });

  it('should create a GroupNode with explicit children and options', () => {
    class CardComp {}
    const node = group({}, { component: CardComp as any, bindings: [inputBinding('title', () => 'Hello')] });
    expect(node.kind).toBe('group');
    expect(node.component).toBe(CardComp);
    expect(node.bindings?.length).toBe(1);
    expect(Object.keys(node.children)).toEqual([]);
  });

  it('should support a registry key for the component', () => {
    const node = group({}, { component: 'card' });
    expect(node.component).toBe('card');
  });

  it('should create a GroupNode from data-driven FieldTree + callback', () => {
    const f = mockFieldTree({ name: '' }) as unknown as FieldTree<{ name: string }>;
    (f as any).name = mockFieldTree('');
    const node = group(f, (g) => ({ name: control(g.name) }));
    expect(node.kind).toBe('group');
    expect(Object.keys(node.children)).toEqual(['name']);
  });

  it('should create a GroupNode from FieldTree + options + callback', () => {
    class CardComp {}
    const f = mockFieldTree({ name: '' }) as unknown as FieldTree<{ name: string }>;
    (f as any).name = mockFieldTree('');
    const node = group(f, { component: CardComp as any }, (g) => ({ name: control(g.name) }));
    expect(node.kind).toBe('group');
    expect(node.component).toBe(CardComp);
    expect(Object.keys(node.children)).toEqual(['name']);
  });
});

describe('array()', () => {
  it('should create a static ArrayNode with ordered children', () => {
    const f1 = mockFieldTree('a');
    const f2 = mockFieldTree('b');
    const node = array([control(f1), control(f2)]);
    expect(node.kind).toBe('array');
    expect(node.children?.length).toBe(2);
    expect(node.field).toBeUndefined();
  });

  it('should create a static ArrayNode with options', () => {
    class StepperComp {}
    const f = mockFieldTree('a');
    const node = array([control(f)], { component: StepperComp as any });
    expect(node.kind).toBe('array');
    expect(node.component).toBe(StepperComp);
    expect(node.children?.length).toBe(1);
  });

  it('should create a renderer-owned ArrayNode from FieldTree', () => {
    const f = mockFieldTree([]);
    const node = array(f);
    expect(node.kind).toBe('array');
    expect(node.field).toBe(f);
    expect(node.itemLayout).toBeUndefined();
    expect(node.children).toBeUndefined();
  });

  it('should create a renderer-owned ArrayNode with options', () => {
    class ListComp {}
    const f = mockFieldTree([]);
    const node = array(f, { component: ListComp as any });
    expect(node.kind).toBe('array');
    expect(node.field).toBe(f);
    expect(node.component).toBe(ListComp);
  });

  it('should create a library-iterated ArrayNode from FieldTree + callback', () => {
    const f = mockFieldTree([{ name: '' }]);
    const itemFn = (item: any) => control(item);
    const node = array(f, itemFn);
    expect(node.kind).toBe('array');
    expect(node.field).toBe(f);
    expect(node.itemLayout).toBe(itemFn);
    expect(node.children).toBeUndefined();
  });
});

describe('layout()', () => {
  it('should return a function that calls fn with the form ref', () => {
    const f = mockFieldTree({ name: '' });
    f.name = mockFieldTree('');
    const layoutFn = layout(f, (form) => [control(form)]);
    expect(typeof layoutFn).toBe('function');
    const nodes = layoutFn();
    expect(nodes.length).toBe(1);
    expect(nodes[0].kind).toBe('control');
  });

  it('should return consistent results on multiple calls', () => {
    const f = mockFieldTree({ name: '' });
    const layoutFn = layout(f, () => [group({})]);
    const r1 = layoutFn();
    const r2 = layoutFn();
    expect(r1.length).toBe(1);
    expect(r1[0].kind).toBe('group');
    // The layout is a computed: reading it again returns the same nodes, not a rebuilt copy.
    expect(r2).toBe(r1);
  });
});

// Components for the static inputs typing tests (never rendered).
@Component({ selector: 'test-rating', template: '' })
class Rating {
  readonly label = input('');
  readonly stars = input(5, { alias: 'count' });
  readonly compact = input(false, { transform: booleanAttribute });
  readonly size = input<number, string | number>(1, { transform: numberAttribute });
  readonly open = model(false);
  readonly derived = computed(() => 1);
}
class PlainProps {
  label = '';
}
@Component({ selector: 'test-other', template: '' })
class Other {
  readonly title = input('');
}
@Component({ selector: 'test-other-with-hint', template: '' })
class OtherWithHint extends Other {
  readonly hint = input('');
}
@Component({ selector: 'test-mixed', template: '' })
class Mixed {
  readonly label = input('');
  @Input() legacy = '';
}
@Directive({ selector: '[testTip]' })
class Tip {
  readonly tip = input('');
}
@Component({
  selector: 'test-with-tip',
  template: '',
  hostDirectives: [{ directive: Tip, inputs: ['tip'] }],
})
class WithTip {
  readonly label = input('');
}

describe('builder types', () => {
  const makeForm = () =>
    TestBed.runInInjectionContext(() => form(signal({ items: [{ name: 'a' }] })));

  it("infers the item field's type in an item layout", () => {
    const f = makeForm();
    array(f.items, (item) => {
      expectTypeOf(item.name).toEqualTypeOf(f.items[0].name);
      // @ts-expect-error — not a field of the item
      void item.nope;
      return control(item.name);
    });
  });

  it('gives content nodes no field', () => {
    const node = content('heading');
    // @ts-expect-error — content isn't bound to a field
    void node.field;
    expect(node).toEqual({ kind: 'content', component: 'heading' });
  });

  it('types static inputs from the component class', () => {
    const name = makeForm().items[0].name;
    control(name, { component: Rating, inputs: { label: 'Stars', stars: 3, compact: 'yes', size: '3', open: true } });
    // @ts-expect-error — not an input of Rating
    control(name, { component: Rating, inputs: { nope: 1 } });
    // @ts-expect-error — `label` takes a string
    control(name, { component: Rating, inputs: { label: 1 } });
    // @ts-expect-error — keyed by property name (`stars`), not by the public alias
    control(name, { component: Rating, inputs: { count: 3 } });
    // @ts-expect-error — a computed signal is not an input
    control(name, { component: Rating, inputs: { derived: 1 } });
    group({}, { component: Rating, inputs: { label: 'Stars' } });
    // @ts-expect-error — not an input of Rating
    array(makeForm().items, { component: Rating, inputs: { nope: 1 } });
    // @ts-expect-error — not an input of Rating
    content(Rating, { inputs: { nope: 1 } });
  });

  it('leaves static inputs untyped for a registry key or a class without signal inputs', () => {
    const name = makeForm().items[0].name;
    control(name, { component: 'rating', inputs: { anything: 1 } });
    content('heading', { inputs: { text: 'Billing' } });
    control(name, { component: PlainProps, inputs: { anything: 1 } });
  });

  it('accepts the inputs of any class in a union of classes', () => {
    const name = makeForm().items[0].name;
    const pick = (flag: boolean) => (flag ? Rating : Other);
    control(name, { component: pick(true), inputs: { label: 'x' } });
    control(name, { component: pick(false), inputs: { title: 'x' } });
    // Not checked against the class that renders: `title` reaches Rating too (NG0315 in dev mode).
    control(name, { component: pick(true), inputs: { label: 'x', title: 'y' } });
    // @ts-expect-error — an input of neither class
    control(name, { component: pick(true), inputs: { nope: 1 } });
    content(pick(true), { inputs: { title: 'x' } });
    group({}, { component: pick(true) });
  });

  it("types a subclass in a union as its base class, TypeScript's reduction of the union", () => {
    const name = makeForm().items[0].name;
    const pick = (flag: boolean) => (flag ? Other : OtherWithHint);
    control(name, { component: pick(true), inputs: { title: 'x' } });
    // @ts-expect-error — the union reduces to Other, which has no `hint`
    control(name, { component: pick(true), inputs: { hint: 'x' } });
  });

  it('types an input only one class has when each class is its own node', () => {
    const name = makeForm().items[0].name;
    const compact = signal(true);
    void (compact()
      ? control(name, { component: Rating, inputs: { stars: 3 } })
      : control(name, { component: Other, inputs: { title: 'x' } }));
  });

  it("doesn't type inputs from the class's hostDirectives: they go through bindings", () => {
    const name = makeForm().items[0].name;
    // @ts-expect-error — TypeScript can't see decorator arguments
    control(name, { component: WithTip, inputs: { label: 'x', tip: 'Hi' } });
    control(name, { component: WithTip, inputs: { label: 'x' }, bindings: [inputBinding('tip', () => 'Hi')] });
    control(name, { component: 'withTip', inputs: { tip: 'Hi' } });
  });

  it("exports a class's typed inputs as ComponentSignalInputs", () => {
    expectTypeOf<keyof ComponentSignalInputs<Rating>>().toEqualTypeOf<'label' | 'stars' | 'compact' | 'size' | 'open'>();
    expectTypeOf<ComponentSignalInputs<Rating>['size']>().toEqualTypeOf<string | number | undefined>();
  });

  it('leaves inputs untyped when the component may be a registry key', () => {
    const name = makeForm().items[0].name;
    const pick = (flag: boolean) => (flag ? Rating : 'rating');
    control(name, { component: pick(true), inputs: { anything: 1 } });
  });

  it('lets typed options stand in for the plain LayoutNodeOptions type', () => {
    const typed: LayoutNodeOptions<typeof Rating> = { component: Rating, inputs: { label: 'x' } };
    const plain: LayoutNodeOptions = typed;
    const list: LayoutNodeOptions[] = [typed, { component: 'text' }];
    expect([plain, list.length]).toEqual([typed, 2]);
  });

  it('checks options declared in a variable with satisfies', () => {
    const ok = { component: Rating, inputs: { label: 'x' } } satisfies LayoutNodeOptions<typeof Rating>;
    // @ts-expect-error — not an input of Rating
    const typo = { component: Rating, inputs: { label: 'x', nope: 1 } } satisfies LayoutNodeOptions<typeof Rating>;
    control(makeForm().items[0].name, ok);
    void typo;
  });

  it('types only signal inputs: a decorator input on the same class goes through bindings', () => {
    const name = makeForm().items[0].name;
    control(name, { component: Mixed, inputs: { label: 'x' } });
    // @ts-expect-error — decorator @Input()s aren't typed; use bindings: [inputBinding('legacy', …)]
    control(name, { component: Mixed, inputs: { legacy: 'x' } });
    control(name, { component: Mixed, bindings: [inputBinding('legacy', () => 'x')] });
  });

  it("takes untyped inputs on a directive entry", () => {
    const name = makeForm().items[0].name;
    control(name, { component: 'text', directives: [{ type: Rating, inputs: { anything: 1 } }] });
  });
});
