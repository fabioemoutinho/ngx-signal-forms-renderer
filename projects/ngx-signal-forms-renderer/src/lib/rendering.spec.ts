import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  Component,
  computed,
  Directive,
  input,
  inputBinding,
  model,
  OnDestroy,
  signal,
  Type,
  WritableSignal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  FieldTree,
  form,
  FormCheckboxControl,
  hidden,
  SchemaOrSchemaFn,
} from '@angular/forms/signals';
import { array, control, group, layout } from './layout';
import { LayoutNode } from './layout-types';
import { SfrChildrenComponent } from './children.component';
import { SfrFormComponent } from './sfr-form.component';

// ── Instrumented test components ──────────────────────────────────────────

/** Every live/destroyed instance of the tracked components, reset before each test. */
const created: object[] = [];
const destroyed: object[] = [];

/** Plain control that records its own creation and destruction. */
@Component({ selector: 'test-tracked', template: '{{ field()().value() }}' })
class TrackedControl implements OnDestroy {
  readonly field = input.required<FieldTree<string>>();
  readonly label = input('');
  constructor() {
    created.push(this);
  }
  ngOnDestroy(): void {
    destroyed.push(this);
  }
}

/** Array wrapper that renders its items through the public `<sfr-children>` helper. */
@Component({
  selector: 'test-list-wrapper',
  imports: [SfrChildrenComponent],
  template: `<sfr-children [children]="children()" />`,
})
class ListWrapper {
  readonly children = input.required<LayoutNode[]>();
}

/** Group wrapper that places children by key. */
@Component({
  selector: 'test-card',
  imports: [SfrChildrenComponent],
  template: `<section><sfr-children [children]="children()" /></section>`,
})
class CardWrapper {
  readonly children = input.required<Record<string, LayoutNode>>();
}

/** Renderer-owned array component: receives the array field itself. */
@Component({ selector: 'test-owned-list', template: '{{ field()().value().length }}' })
class OwnedList {
  readonly field = input.required<FieldTree<{ name: string }[]>>();
}

/** Checkbox-style custom control (`checked` model instead of `value`). */
@Component({ selector: 'test-checkbox', template: '{{ checked() }}' })
class CheckboxControl implements FormCheckboxControl {
  readonly checked = model(false);
}

/** Consumer host directive, to verify it is attached alongside the renderer's own. */
@Directive({ selector: '[testMarker]', host: { 'data-marker': 'yes' } })
class MarkerDirective {}

// ── Harness ────────────────────────────────────────────────────────────────

async function renderForm<T>(
  initial: T,
  build: (f: FieldTree<T>) => LayoutNode[],
  schema?: SchemaOrSchemaFn<T>,
) {
  @Component({
    imports: [SfrFormComponent],
    template: `<sfr-form [layout]="l" />`,
  })
  class Host {
    readonly model: WritableSignal<T> = signal(initial);
    readonly f: FieldTree<T> = schema ? form(this.model, schema) : form(this.model);
    readonly l = layout(this.f, build);
  }

  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const host = fixture.componentInstance;
  /**
   * Applies a change, then waits for Angular's (zoneless) scheduler to settle — no forced
   * detectChanges, so a change only renders if it actually schedules a tick, and assertions run
   * after every follow-up tick, not just the first.
   */
  const act = async (fn: () => void) => {
    fn();
    await fixture.whenStable();
  };
  /** Rendered instances of a component, in DOM order. */
  const all = <C>(type: Type<C>): C[] =>
    fixture.debugElement.queryAll(By.directive(type)).map((d) => d.componentInstance);
  /** Text of each rendered leaf control, space-joined in DOM order (e.g. 'a b c'). */
  const text = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('test-tracked, test-checkbox'))
      .map((el) => el.textContent?.trim())
      .join(' ');
  return { fixture, host, act, all, text };
}

type Item = { name: string };
const items = (...names: string[]): Item[] => names.map((name) => ({ name }));

beforeEach(() => {
  created.length = 0;
  destroyed.length = 0;
});

afterEach(() => vi.restoreAllMocks());

// ── Component stability (no needless recreation) ─────────────────────────

describe('component stability', () => {
  it('does not recreate a control when its value changes', async () => {
    const { host, act, all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl }),
    ]);
    const [before] = all(TrackedControl);

    await act(() => host.model.set({ name: 'Grace' }));

    expect(all(TrackedControl)).toEqual([before]);
    expect(created).toHaveLength(1);
    expect(destroyed).toHaveLength(0);
  });

  it('does not recreate anything on repeated application ticks', async () => {
    const { fixture } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl }),
    ]);
    for (let i = 0; i < 5; i++) TestBed.tick();
    await fixture.whenStable();
    expect(created).toHaveLength(1);
    expect(destroyed).toHaveLength(0);
  });

  it('updates a reactive consumer binding in place, without recreating', async () => {
    const label = signal('First');
    const { act, all } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl, bindings: [inputBinding('label', label)] }),
    ]);
    const [before] = all(TrackedControl);

    await act(() => label.set('Second'));

    expect(before.label()).toBe('Second');
    expect(all(TrackedControl)).toEqual([before]);
    expect(created).toHaveLength(1);
  });

  it('runs the layout function once, not on every value change', async () => {
    const build = vi.fn((f: FieldTree<{ name: string }>) => [
      control(f.name, { component: TrackedControl }),
    ]);
    const { host, act } = await renderForm({ name: 'Ada' }, build);

    await act(() => host.model.set({ name: 'Grace' }));

    expect(build).toHaveBeenCalledTimes(1);
  });

  // KNOWN ISSUE: layout() is one computed; any signal it reads rebuilds every node, so every
  // component is recreated. Flip to `it` once nodes are reused across layout recomputes.
  it.fails('does not recreate unrelated controls when a layout branch toggles', async () => {
    const showExtra = signal(false);
    const { act, all } = await renderForm({ name: 'Ada', extra: 'x' }, (f) => [
      control(f.name, { component: TrackedControl }),
      ...(showExtra() ? [control(f.extra, { component: TrackedControl })] : []),
    ]);
    const [name] = all(TrackedControl);

    await act(() => showExtra.set(true));

    expect(all(TrackedControl)[0]).toBe(name);
  });

  // KNOWN ISSUE (same cause): typing in a field the layout reads recreates that very input,
  // so it loses focus on every keystroke.
  it.fails('does not recreate a control whose own value drives a layout branch', async () => {
    const { host, act, all } = await renderForm({ country: 'US', state: '' }, (f) => [
      control(f.country, { component: TrackedControl }),
      ...(f.country().value() === 'US' ? [control(f.state, { component: TrackedControl })] : []),
    ]);
    const [country] = all(TrackedControl);

    await act(() => host.model.update((m) => ({ ...m, country: 'USA' })));

    expect(all(TrackedControl)[0]).toBe(country);
  });

  it('does not recreate anything when the same condition is expressed as a node-level hidden', async () => {
    const { host, act, all } = await renderForm({ country: 'US', state: '' }, (f) => [
      control(f.country, { component: TrackedControl }),
      control(f.state, {
        component: TrackedControl,
        hidden: computed(() => f.country().value() !== 'US'),
      }),
    ]);
    const [country] = all(TrackedControl);

    await act(() => host.model.update((m) => ({ ...m, country: 'USA' })));
    expect(all(TrackedControl)).toEqual([country]);

    await act(() => host.model.update((m) => ({ ...m, country: 'US' })));
    expect(all(TrackedControl)[0]).toBe(country);
    // Only the conditional control is recreated when it reappears.
    expect(created).toHaveLength(3);
  });
});

// ── Library-iterated arrays ──────────────────────────────────────────────

// Both rendering paths (sfr-node's own fallback and a wrapper's `<sfr-children>`) must track rows
// by node identity, so removals and reorders move components instead of recreating them.
describe.each([
  {
    mode: 'fallback (no wrapper)',
    build: (f: FieldTree<{ items: Item[] }>) => [
      array(f.items, (item) => control(item.name, { component: TrackedControl })),
    ],
  },
  {
    mode: 'wrapper using <sfr-children>',
    build: (f: FieldTree<{ items: Item[] }>) => [
      array(f.items, { component: ListWrapper }, (item) =>
        control(item.name, { component: TrackedControl }),
      ),
    ],
  },
])('library-iterated array — $mode', ({ build }) => {

  async function setup() {
    const r = await renderForm({ items: items('a', 'b', 'c') }, build);
    /** Rendered rows as creation-order ids (0 = first instance ever created), in DOM order. */
    const ids = () => r.all(TrackedControl).map((row) => created.indexOf(row));
    return { ...r, ids };
  }

  it('renders one row per item', async () => {
    const { text, ids } = await setup();
    expect(text()).toBe('a b c');
    expect(ids()).toEqual([0, 1, 2]);
  });

  it('does not recreate rows when the model is replaced with an edited item', async () => {
    const { host, act, ids, text } = await setup();

    await act(() => host.model.update((m) => ({ items: [m.items[0], { name: 'B' }, m.items[2]] })));

    expect(text()).toBe('a B c');
    // The edited item is a new object, so it is a new row; its neighbours are kept.
    expect(ids()).toEqual([0, 3, 2]);
  });

  it('does not recreate any row when an item is edited through its field', async () => {
    const { host, act, ids, text } = await setup();

    await act(() => host.f.items[1].name().value.set('B'));

    expect(text()).toBe('a B c');
    expect(ids()).toEqual([0, 1, 2]);
    expect(destroyed).toHaveLength(0);
  });

  it('does not recreate existing rows when an item is appended', async () => {
    const { host, act, ids } = await setup();

    await act(() => host.model.update((m) => ({ items: [...m.items, { name: 'd' }] })));

    expect(ids()).toEqual([0, 1, 2, 3]);
    expect(destroyed).toHaveLength(0);
  });

  it('does not recreate the remaining rows when the first item is removed', async () => {
    const { host, act, ids, text } = await setup();

    await act(() => host.model.update((m) => ({ items: m.items.slice(1) })));

    expect(text()).toBe('b c');
    expect(ids()).toEqual([1, 2]);
    expect(destroyed).toHaveLength(1);
  });

  it('moves (does not recreate) rows when items are reordered', async () => {
    const { host, act, ids, text } = await setup();

    await act(() => host.model.update((m) => ({ items: [m.items[1], m.items[0], m.items[2]] })));

    expect(text()).toBe('b a c');
    expect(ids()).toEqual([1, 0, 2]);
    expect(destroyed).toHaveLength(0);
  });
});

describe('itemLayout', () => {
  it('runs once per item, not again on value changes', async () => {
    const itemLayout = vi.fn((item: FieldTree<Item>) =>
      control(item.name, { component: TrackedControl }),
    );
    const { host, act } = await renderForm({ items: items('a', 'b') }, (f) => [
      array(f.items, itemLayout),
    ]);

    await act(() => host.f.items[0].name().value.set('A'));

    expect(itemLayout).toHaveBeenCalledTimes(2);
  });

  it('runs only for the new item when one is appended', async () => {
    const itemLayout = vi.fn((item: FieldTree<Item>) =>
      control(item.name, { component: TrackedControl }),
    );
    const { host, act } = await renderForm({ items: items('a', 'b') }, (f) => [
      array(f.items, itemLayout),
    ]);

    await act(() => host.model.update((m) => ({ items: [...m.items, { name: 'c' }] })));

    expect(itemLayout).toHaveBeenCalledTimes(3);
  });
});

// ── Visibility ────────────────────────────────────────────────────────────

describe('visibility', () => {
  it("hides a control when the field's native hidden() is true", async () => {
    const { host, act, all } = await renderForm(
      { name: 'Ada', hide: false },
      (f) => [control(f.name, { component: TrackedControl })],
      (p) => hidden(p.name, { when: ({ valueOf }) => valueOf(p.hide) }),
    );
    expect(all(TrackedControl)).toHaveLength(1);

    await act(() => host.model.update((m) => ({ ...m, hide: true })));
    expect(all(TrackedControl)).toHaveLength(0);
  });

  it("lets a layout-level hidden signal override the field's hidden()", async () => {
    const { all } = await renderForm(
      { name: 'Ada' },
      (f) => [control(f.name, { component: TrackedControl, hidden: signal(false) })],
      (p) => hidden(p.name, { when: () => true }),
    );
    expect(all(TrackedControl)).toHaveLength(1);
  });

  it("hides a data-driven group when its field's hidden() is true", async () => {
    const { all } = await renderForm(
      { address: { street: 'Main' } },
      (f) => [group(f.address, (g) => ({ street: control(g.street, { component: TrackedControl }) }))],
      (p) => hidden(p.address, { when: () => true }),
    );
    expect(all(TrackedControl)).toHaveLength(0);
  });

  it('renders no DOM at all for a hidden node', async () => {
    const { fixture } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl, hidden: signal(true) }),
    ]);
    const node: HTMLElement = fixture.nativeElement.querySelector('sfr-node');
    expect(node.children).toHaveLength(0);
  });

  it('keeps array items (data lives in the form) across hide and show', async () => {
    const show = signal(true);
    const { host, act, text } = await renderForm({ items: items('a', 'b') }, (f) => [
      array(f.items, { hidden: computed(() => !show()) }, (item) =>
        control(item.name, { component: TrackedControl }),
      ),
    ]);

    await act(() => show.set(false));
    await act(() => host.model.update((m) => ({ items: [...m.items, { name: 'c' }] })));
    await act(() => show.set(true));

    expect(text()).toBe('a b c');
  });
});

// ── Node kinds & component contracts ─────────────────────────────────────

describe('node kinds', () => {
  it('renders an explicit group without a component by rendering its children', async () => {
    const { text } = await renderForm({ a: 'x', b: 'y' }, (f) => [
      group({
        a: control(f.a, { component: TrackedControl }),
        b: control(f.b, { component: TrackedControl }),
      }),
    ]);
    expect(text()).toBe('x y');
  });

  it('passes the keyed children record to a group wrapper', async () => {
    const { all, text } = await renderForm({ a: 'x', b: 'y' }, (f) => [
      group(
        { a: control(f.a, { component: TrackedControl }), b: control(f.b, { component: TrackedControl }) },
        { component: CardWrapper },
      ),
    ]);
    expect(Object.keys(all(CardWrapper)[0].children())).toEqual(['a', 'b']);
    expect(text()).toBe('x y');
  });

  it('passes the array field to a renderer-owned array component', async () => {
    const { host, all } = await renderForm({ items: items('a', 'b') }, (f) => [
      array(f.items, { component: OwnedList }),
    ]);
    expect(all(OwnedList)[0].field()).toBe(host.f.items);
  });

  it('passes static children to a static array wrapper', async () => {
    const { all, text } = await renderForm({ a: 'x', b: 'y' }, (f) => [
      array([control(f.a, { component: TrackedControl }), control(f.b, { component: TrackedControl })], {
        component: ListWrapper,
      }),
    ]);
    expect(all(ListWrapper)[0].children()).toHaveLength(2);
    expect(text()).toBe('x y');
  });

  it('attaches consumer host directives', async () => {
    const { fixture } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl, directives: [MarkerDirective] }),
    ]);
    expect(fixture.nativeElement.querySelector('test-tracked').getAttribute('data-marker')).toBe('yes');
  });

  it('attaches FormField to a FormCheckboxControl and syncs checked both ways', async () => {
    const { host, act, all, text } = await renderForm({ agree: true }, (f) => [
      control(f.agree, { component: CheckboxControl }),
    ]);
    expect(text()).toBe('true');

    await act(() => all(CheckboxControl)[0].checked.set(false));
    expect(host.model().agree).toBe(false);

    await act(() => host.model.set({ agree: true }));
    expect(text()).toBe('true');
  });

  it('warns in dev mode when a control resolves no component', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderForm({ name: 'Ada' }, (f) => [control(f.name)]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('No component resolved'),
      expect.any(String),
    );
  });
});
