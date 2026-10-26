import { describe, it, expect, expectTypeOf } from 'vitest';
import { signal, inputBinding } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';
import { control, group, array, content, layout } from './layout';

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
    expect(node.type).toBeUndefined();
    expect(node.component).toBeUndefined();
  });

  it('should create a ControlNode with options', () => {
    const f = mockFieldTree('hello');
    const node = control(f, { type: 'text', bindings: [inputBinding('label', () => 'Name')] });
    expect(node.kind).toBe('control');
    expect(node.type).toBe('text');
    expect(node.bindings?.length).toBe(1);
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

  it('should support type string for registry resolution', () => {
    const node = group({}, { type: 'card' });
    expect(node.type).toBe('card');
    expect(node.component).toBeUndefined();
  });

  it('no longer accepts a node-level hidden signal (use when() or the schema)', () => {
    // @ts-expect-error — removed; use when(condition, () => node) or the schema's hidden()
    group({}, { hidden: signal(true) });
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
    expect(node).toEqual({ kind: 'content', type: 'heading' });
  });
});
