import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { inputBinding, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, hidden } from '@angular/forms/signals';
import { array, content, control, group } from './layout';
import { provideSignalFormsRenderer } from './provider';
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

const textOf = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('test-content'))
    .map((c) => c.textContent?.trim())
    .join(' ');

// ── content() ─────────────────────────────────────────────────────────────

describe('content', () => {
  it('builds a field-less node from a component or a registered type', () => {
    const binding = inputBinding('text', () => 'Hi');

    expect(content(TextContent, { bindings: [binding] })).toEqual({
      kind: 'content',
      component: TextContent,
      bindings: [binding],
    });
    expect(content('heading')).toEqual({ kind: 'content', type: 'heading' });
  });

  it('renders the component with its own bindings only, never the reserved inputs', async () => {
    const { fixture, all } = await renderForm({ name: 'Ada' }, () => [
      content(TextContent, { bindings: [inputBinding('text', () => 'Billing')] }),
    ]);

    expect(textOf(fixture.nativeElement)).toBe('Billing');
    const [c] = all(TextContent);
    expect([c.field(), c.state(), c.children()]).toEqual([undefined, undefined, undefined]);
  });

  it('resolves a registered type', async () => {
    const { fixture } = await renderForm(
      {},
      () => [content('heading', { bindings: [inputBinding('text', () => 'Billing')] })],
      { providers: [provideSignalFormsRenderer({ types: { heading: TextContent } })] },
    );

    expect(textOf(fixture.nativeElement)).toBe('Billing');
  });

  it('attaches host directives', async () => {
    const { fixture } = await renderForm({}, () => [
      content(TextContent, { directives: [MarkerDirective] }),
    ]);

    expect(fixture.nativeElement.querySelector('test-content').dataset.marker).toBe('yes');
  });

  it('updates a reactive binding in place, without recreating the component', async () => {
    const title = signal('Billing');
    const { fixture, expectStable } = await renderForm({}, () => [
      content(TextContent, { bindings: [inputBinding('text', title)] }),
    ]);

    await expectStable(() => title.set('Shipping'));

    expect(textOf(fixture.nativeElement)).toBe('Shipping');
  });

  it('can derive its text from form values', async () => {
    const { fixture, host, expectStable } = await renderForm({ name: 'Ada' }, (f) => [
      control(f.name, { component: TrackedControl }),
      content(TextContent, { bindings: [inputBinding('text', () => `Hello ${f.name().value()}`)] }),
    ]);

    await expectStable(() => host.f.name().value.set('Grace'));

    expect(textOf(fixture.nativeElement)).toBe('Hello Grace');
  });

  it('renders by key inside a group wrapper', async () => {
    const { fixture } = await renderForm({ name: 'Ada' }, (f) => [
      group(
        {
          intro: content(TextContent, { bindings: [inputBinding('text', () => 'About you')] }),
          name: control(f.name, { component: TrackedControl }),
        },
        { component: CardWrapper },
      ),
    ]);

    expect(textOf(fixture.nativeElement)).toBe('About you');
  });

  it('renders nothing and warns in dev mode when no component resolves', async () => {
    const { count } = spyWarn();
    const { fixture } = await renderForm({}, () => [content('unregistered')]);

    expect(fixture.nativeElement.querySelector('sfr-node').children).toHaveLength(0);
    expect(count('No component resolved for content node')).toBe(1);
  });
});

// ── array empty ───────────────────────────────────────────────────────────

describe('array empty', () => {
  const emptyNotice = () =>
    content(TextContent, { bindings: [inputBinding('text', () => 'No items yet')] });

  it.each([
    ['without a wrapper', {}],
    ['with a wrapper', { component: ListWrapper }],
  ])('renders the empty node while there are no items, %s', async (_, options) => {
    const { fixture, host, act } = await renderForm({ items: [] as { name: string }[] }, (f) => [
      array(f.items, { ...options, empty: emptyNotice() }, (item) =>
        control(item.name, { component: TrackedControl }),
      ),
    ]);
    const el: HTMLElement = fixture.nativeElement;
    expect(textOf(el)).toBe('No items yet');

    await act(() => host.f.items().value.set(items('a')));
    expect(textOf(el)).toBe('');
    expect(el.querySelectorAll('test-tracked')).toHaveLength(1);

    await act(() => host.f.items().value.set([]));
    expect(textOf(el)).toBe('No items yet');
  });

  it('keeps the empty node while the array stays empty', async () => {
    const { host, expectStable } = await renderForm(
      { items: [] as { name: string }[], other: 'x' },
      (f) => [array(f.items, { empty: emptyNotice() }, (item) => control(item.name, { component: TrackedControl }))],
    );
    expect(created.filter((c) => c instanceof TextContent)).toHaveLength(1);

    await expectStable(() => host.f.other().value.set('y'));
  });

  it('does not render the empty node while the array is hidden by the schema', async () => {
    const { host, act } = await renderForm(
      { hide: true, items: [] as { name: string }[] },
      (f) => [array(f.items, { empty: emptyNotice() }, (item) => control(item.name, { component: TrackedControl }))],
      { schema: (p) => hidden(p.items, { when: ({ valueOf }) => valueOf(p.hide) }) },
    );
    const notices = () => created.filter((c) => c instanceof TextContent).length;
    expect(notices()).toBe(0);

    await act(() => host.f.hide().value.set(false));

    expect(notices()).toBe(1);
  });

  it('renders nothing for an empty array without an empty node', async () => {
    const { fixture } = await renderForm({ items: [] as { name: string }[] }, (f) => [
      array(f.items, (item) => control(item.name, { component: TrackedControl })),
    ]);

    expect(fixture.nativeElement.querySelector('sfr-node').children).toHaveLength(0);
  });

  it('is only accepted on library-iterated arrays', () => {
    const f = TestBed.runInInjectionContext(() => form(signal({ items: items('a') })));
    const node = content(TextContent);
    array(f.items, { empty: node }, (item) => control(item.name));
    // @ts-expect-error — renderer-owned arrays render their own empty state
    array(f.items, { component: ListWrapper, empty: node });
    // @ts-expect-error — static arrays have no items to run out of
    array([], { empty: node });
    // @ts-expect-error — groups have no items
    group({}, { empty: node });
  });
});
