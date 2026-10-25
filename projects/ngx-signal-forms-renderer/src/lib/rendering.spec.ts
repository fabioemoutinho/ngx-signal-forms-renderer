import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { computed, inputBinding, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, hidden } from '@angular/forms/signals';
import { array, control, group } from './layout';
import { provideSignalFormsRenderer } from './provider';
import {
  CardWrapper,
  CheckboxControl,
  created,
  destroyed,
  Item,
  items,
  ListWrapper,
  MarkerDirective,
  OwnedList,
  renderForm,
  resetTracking,
  StaticWrapper,
  TrackedControl,
} from './testing/harness';

beforeEach(() => resetTracking());

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

  const setup = () => renderForm({ items: items('a', 'b', 'c') }, build);

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
      { schema: (p) => hidden(p.name, { when: ({ valueOf }) => valueOf(p.hide) }) },
    );
    expect(all(TrackedControl)).toHaveLength(1);

    await act(() => host.model.update((m) => ({ ...m, hide: true })));
    expect(all(TrackedControl)).toHaveLength(0);
  });

  it("lets a layout-level hidden signal override the field's hidden()", async () => {
    const { all } = await renderForm(
      { name: 'Ada' },
      (f) => [control(f.name, { component: TrackedControl, hidden: signal(false) })],
      { schema: (p) => hidden(p.name, { when: () => true }) },
    );
    expect(all(TrackedControl)).toHaveLength(1);
  });

  it("hides a data-driven group when its field's hidden() is true", async () => {
    const { all } = await renderForm(
      { address: { street: 'Main' } },
      (f) => [group(f.address, (g) => ({ street: control(g.street, { component: TrackedControl }) }))],
      { schema: (p) => hidden(p.address, { when: () => true }) },
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

// ── Wrapper bindings ──────────────────────────────────────────────────────

describe('wrapper bindings', () => {
  // Reserved inputs are bound only when declared, so wrappers that don't need them don't throw
  // "unknown input" (NG0315) in dev mode.
  it('renders a group wrapper that declares no children input', async () => {
    const { fixture } = await renderForm({ a: 'x' }, (f) => [
      group({ a: control(f.a, { component: TrackedControl }) }, { component: StaticWrapper }),
    ]);
    expect(fixture.nativeElement.textContent).toContain('static');
  });

  it('renders a library-iterated array wrapper that declares no children input', async () => {
    const { fixture } = await renderForm({ items: items('a') }, (f) => [
      array(f.items, { component: StaticWrapper }, (item) =>
        control(item.name, { component: TrackedControl }),
      ),
    ]);
    expect(fixture.nativeElement.textContent).toContain('static');
  });

  it('renders a static array wrapper that declares no children input', async () => {
    const { fixture } = await renderForm({ a: 'x' }, (f) => [
      array([control(f.a, { component: TrackedControl })], { component: StaticWrapper }),
    ]);
    expect(fixture.nativeElement.textContent).toContain('static');
  });

  it('renders a renderer-owned array component that declares no field input', async () => {
    const { fixture } = await renderForm({ items: items('a') }, (f) => [
      array(f.items, { component: StaticWrapper }),
    ]);
    expect(fixture.nativeElement.textContent).toContain('static');
  });

  it('attaches consumer host directives to a group wrapper', async () => {
    const { fixture } = await renderForm({ a: 'x' }, (f) => [
      group({ a: control(f.a, { component: TrackedControl }) }, {
        component: CardWrapper,
        directives: [MarkerDirective],
      }),
    ]);
    expect(fixture.nativeElement.querySelector('test-card').getAttribute('data-marker')).toBe('yes');
  });

  it('updates a reactive binding on a group wrapper in place, without recreating', async () => {
    const title = signal('One');
    const { all, expectStable } = await renderForm({ a: 'x' }, (f) => [
      group({ a: control(f.a, { component: TrackedControl }) }, {
        component: CardWrapper,
        bindings: [inputBinding('title', title)],
      }),
    ]);

    await expectStable(() => title.set('Two'));

    expect(all(CardWrapper)[0].title()).toBe('Two');
  });
});

// ── Registry resolution ───────────────────────────────────────────────────

describe('registry resolution', () => {
  const providers = [
    provideSignalFormsRenderer({ types: { text: TrackedControl, card: CardWrapper, list: ListWrapper } }),
  ];

  it('resolves a group wrapper by type', async () => {
    const { all, text } = await renderForm(
      { a: 'x' },
      (f) => [group({ a: control(f.a, { type: 'text' }) }, { type: 'card' })],
      { providers },
    );
    expect(all(CardWrapper)).toHaveLength(1);
    expect(text()).toBe('x');
  });

  it('resolves a library-iterated array wrapper by type', async () => {
    const { all, text } = await renderForm(
      { items: items('a', 'b') },
      (f) => [array(f.items, { type: 'list' }, (item) => control(item.name, { type: 'text' }))],
      { providers },
    );
    expect(all(ListWrapper)).toHaveLength(1);
    expect(text()).toBe('a b');
  });

  it('falls back to rendering the children when a group type is not registered', async () => {
    const { text } = await renderForm(
      { a: 'x' },
      (f) => [group({ a: control(f.a, { type: 'text' }) }, { type: 'unknown' })],
      { providers },
    );
    expect(text()).toBe('x');
  });

  it.todo('warns in dev mode when a group or array type is not registered');
});

// ── Layout swap & lifecycle ───────────────────────────────────────────────

describe('layout swap and lifecycle', () => {
  it('renders a new layout passed to <sfr-form> and destroys the old components', async () => {
    const { swapLayout, all, text } = await renderForm({ a: 'x', b: 'y' }, (f) => [
      control(f.a, { component: TrackedControl }),
    ]);
    const [old] = all(TrackedControl);

    await swapLayout((f) => [control(f.b, { component: TrackedControl })]);

    expect(text()).toBe('y');
    expect(destroyed).toEqual([old]);
  });

  it('destroys every rendered component when <sfr-form> is destroyed', async () => {
    const { fixture } = await renderForm({ a: 'x', items: items('a', 'b') }, (f) => [
      group({ a: control(f.a, { component: TrackedControl }) }, { component: CardWrapper }),
      array(f.items, { component: ListWrapper }, (item) =>
        control(item.name, { component: TrackedControl }),
      ),
    ]);

    fixture.destroy();

    expect(created).toHaveLength(5);
    expect(new Set(destroyed)).toEqual(new Set(created));
  });

  it('renders two <sfr-form>s over the same form in sync, without recreating either', async () => {
    const { host, text, expectStable } = await renderForm(
      { name: 'Ada' },
      (f) => [control(f.name, { component: TrackedControl })],
      { twice: true },
    );
    expect(text()).toBe('Ada Ada');

    await expectStable(() => host.f.name().value.set('Grace'));

    expect(text()).toBe('Grace Grace');
  });

  it('renders no box of its own (display: contents)', async () => {
    const { fixture } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl }),
    ]);
    const node: HTMLElement = fixture.nativeElement.querySelector('sfr-node');
    expect(getComputedStyle(node).display).toBe('contents');
  });
});

// ── Nesting ───────────────────────────────────────────────────────────────

describe('nesting', () => {
  type Section = { title: string; items: Item[] };
  const sections = (...s: Section[]) => ({ sections: s });

  const nested = (f: FieldTree<{ sections: Section[] }>) => [
    array(f.sections, (section) =>
      group(section, (s) => ({
        items: array(s.items, (item) => control(item.name, { component: TrackedControl })),
      })),
    ),
  ];

  it('does not recreate inner rows when an inner item is edited', async () => {
    const { host, text, expectStable } = await renderForm(
      sections({ title: 'S1', items: items('a', 'b') }, { title: 'S2', items: items('c') }),
      nested,
    );

    await expectStable(() => host.f.sections[1].items[0].name().value.set('C'));

    expect(text()).toBe('a b C');
  });

  it('moves inner rows with their outer item when outer items are reordered', async () => {
    const { host, act, ids, text } = await renderForm(
      sections({ title: 'S1', items: items('a', 'b') }, { title: 'S2', items: items('c') }),
      nested,
    );

    await act(() => host.model.update((m) => ({ sections: [m.sections[1], m.sections[0]] })));

    expect(text()).toBe('c a b');
    expect(ids()).toEqual([2, 0, 1]);
    expect(destroyed).toHaveLength(0);
  });

  it('does not recreate other rows when an inner item is removed', async () => {
    const { host, act, ids } = await renderForm(
      sections({ title: 'S1', items: items('a', 'b') }, { title: 'S2', items: items('c') }),
      nested,
    );

    await act(() =>
      host.model.update((m) => ({
        sections: [{ ...m.sections[0], items: m.sections[0].items.slice(1) }, m.sections[1]],
      })),
    );

    expect(ids()).toEqual([1, 2]);
    expect(destroyed).toHaveLength(1);
  });

  it('does not recreate an array inside a data-driven group when a sibling field changes', async () => {
    const { host, expectStable } = await renderForm(
      { order: { note: 'n', items: items('a', 'b') } },
      (f) => [
        group(f.order, (o) => ({
          note: control(o.note, { component: TrackedControl }),
          items: array(o.items, (item) => control(item.name, { component: TrackedControl })),
        })),
      ],
    );

    await expectStable(() => host.f.order.note().value.set('changed'));
  });
});

// ── More array shapes ─────────────────────────────────────────────────────

describe('array shapes', () => {
  it("hides a library-iterated array when its field's hidden() is true", async () => {
    const { host, act, all } = await renderForm(
      { hide: false, items: items('a', 'b') },
      (f) => [array(f.items, (item) => control(item.name, { component: TrackedControl }))],
      { schema: (p) => hidden(p.items, { when: ({ valueOf }) => valueOf(p.hide) }) },
    );
    expect(all(TrackedControl)).toHaveLength(2);

    await act(() => host.model.update((m) => ({ ...m, hide: true })));
    expect(all(TrackedControl)).toHaveLength(0);
  });

  it("hides a renderer-owned array when its field's hidden() is true", async () => {
    const { all } = await renderForm(
      { items: items('a') },
      (f) => [array(f.items, { component: OwnedList })],
      { schema: (p) => hidden(p.items, { when: () => true }) },
    );
    expect(all(OwnedList)).toHaveLength(0);
  });

  it('syncs a checkbox control inside an array item', async () => {
    const { host, act, all } = await renderForm(
      { todos: [{ done: true }, { done: false }] },
      (f) => [array(f.todos, (todo) => control(todo.done, { component: CheckboxControl }))],
    );

    await act(() => all(CheckboxControl)[1].checked.set(true));

    expect(host.model().todos.map((t) => t.done)).toEqual([true, true]);
  });

  // Signal forms tracks array item identity only for object items; primitive items are keyed by
  // index. Removing the first item therefore keeps the first rows and shifts the values up.
  it('tracks primitive items by index', async () => {
    const { host, act, ids, text } = await renderForm({ tags: ['a', 'b', 'c'] }, (f) => [
      array(f.tags, (tag) => control(tag, { component: TrackedControl })),
    ]);

    await act(() => host.model.update((m) => ({ tags: m.tags.slice(1) })));

    expect(text()).toBe('b c');
    expect(ids()).toEqual([0, 1]);
    expect(destroyed).toHaveLength(1);
  });
});
