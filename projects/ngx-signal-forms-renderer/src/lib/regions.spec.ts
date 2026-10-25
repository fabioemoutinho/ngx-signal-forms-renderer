import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { applyWhenValue, form, hidden, required } from '@angular/forms/signals';
import { array, control, group, switchCase, when } from './layout';
import {
  CardWrapper,
  created,
  destroyed,
  items,
  ListWrapper,
  renderForm,
  resetTracking,
  spyWarn,
  TrackedControl,
} from './testing/harness';

beforeEach(() => resetTracking());

afterEach(() => vi.restoreAllMocks());

const BRANCH_RERUN = 'branch re-ran';
const RERUN = 'The layout function re-ran';

// ── when() ────────────────────────────────────────────────────────────────

describe('when', () => {
  it('renders the branch while the condition is true, and nothing (no DOM) while false', async () => {
    const show = signal(false);
    const { fixture, act, text } = await renderForm({ name: 'Ada' }, (f) => [
      when(show, () => [control(f.name, { component: TrackedControl })]),
    ]);
    expect(text()).toBe('');
    expect(fixture.nativeElement.querySelector('sfr-node').innerHTML).not.toContain('test-');

    await act(() => show.set(true));
    expect(text()).toBe('Ada');

    await act(() => show.set(false));
    expect(text()).toBe('');
  });

  it('renders the else branch while the condition is false', async () => {
    const { host, act, text } = await renderForm({ country: 'US', state: 'CA', region: 'Kent' }, (f) => [
      when(
        () => f.country().value() === 'US',
        () => control(f.state, { component: TrackedControl }),
        () => control(f.region, { component: TrackedControl }),
      ),
    ]);
    expect(text()).toBe('CA');

    await act(() => host.f.country().value.set('UK'));

    expect(text()).toBe('Kent');
  });

  it('rebuilds only when the condition flips, not when its inputs change', async () => {
    const build = vi.fn();
    const { host, act, expectStable, all } = await renderForm({ country: 'US', state: 'CA' }, (f) => [
      control(f.country, { component: TrackedControl }),
      when(
        () => ['UK', 'GB'].includes(f.country().value()),
        () => {
          build();
          return control(f.state, { component: TrackedControl });
        },
      ),
    ]);

    // Stays false.
    await expectStable(() => host.f.country().value.set('USA'));
    expect(build).not.toHaveBeenCalled();

    await act(() => host.f.country().value.set('UK'));
    const [, state] = all(TrackedControl);
    // Stays true.
    await expectStable(() => host.f.country().value.set('GB'));
    await expectStable(() => host.f.state().value.set('Essex'));
    expect(all(TrackedControl)[1]).toBe(state);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('builds branches lazily: only the active one runs', async () => {
    const then = vi.fn(() => []);
    const otherwise = vi.fn(() => []);
    const show = signal(true);
    const { act } = await renderForm({}, () => [when(show, then, otherwise)]);
    expect(then).toHaveBeenCalledTimes(1);
    expect(otherwise).not.toHaveBeenCalled();

    await act(() => show.set(false));

    expect(otherwise).toHaveBeenCalledTimes(1);
  });

  it('keeps sibling components across flips, and recreates the branch each time it appears', async () => {
    const show = signal(false);
    const { act, ids } = await renderForm({ a: 'a', b: 'b' }, (f) => [
      control(f.a, { component: TrackedControl }),
      when(show, () => control(f.b, { component: TrackedControl })),
    ]);

    for (let i = 0; i < 3; i++) {
      await act(() => show.set(true));
      await act(() => show.set(false));
    }
    await act(() => show.set(true));

    expect(ids()).toEqual([0, 4]);
  });

  it('keeps form data across branch removal', async () => {
    const show = signal(true);
    const { host, act, text } = await renderForm({ items: items('a', 'b') }, (f) => [
      when(show, () =>
        array(f.items, { component: ListWrapper }, (item) =>
          control(item.name, { component: TrackedControl }),
        ),
      ),
    ]);

    await act(() => show.set(false));
    await act(() => host.f.items().value.update((v) => [...v, { name: 'c' }]));
    await act(() => show.set(true));

    expect(text()).toBe('a b c');
  });

  it('renders while a field is visible when given a field', async () => {
    const { host, act, text } = await renderForm(
      { business: false, company: 'Acme' },
      (f) => [
        when(f.company, () =>
          group({ company: control(f.company, { component: TrackedControl }) }, { component: CardWrapper }),
        ),
      ],
      { schema: (p) => hidden(p.company, { when: ({ valueOf }) => !valueOf(p.business) }) },
    );
    expect(created.filter((c) => c instanceof CardWrapper)).toHaveLength(0);

    await act(() => host.f.business().value.set(true));
    expect(text()).toBe('Acme');

    await act(() => host.f.business().value.set(false));
    expect(text()).toBe('');
    expect(destroyed.filter((c) => c instanceof CardWrapper)).toHaveLength(1);
  });

  it('works as a group child rendered by key in a wrapper', async () => {
    const show = signal(false);
    const { act, text } = await renderForm({ a: 'a' }, (f) => [
      group({ maybe: when(show, () => control(f.a, { component: TrackedControl })) }, { component: CardWrapper }),
    ]);

    await act(() => show.set(true));

    expect(text()).toBe('a');
  });

  it('works inside array items, keeping rows across reorders', async () => {
    const { host, act, ids, expectStable } = await renderForm({ items: items('a', 'b') }, (f) => [
      array(f.items, (item) =>
        when(() => item.name().value() !== '', () => control(item.name, { component: TrackedControl })),
      ),
    ]);
    expect(ids()).toEqual([0, 1]);

    await expectStable(() => host.model.update((m) => ({ items: [m.items[1], m.items[0]] })));
    expect(ids()).toEqual([1, 0]);

    await act(() => host.f.items[0].name().value.set(''));
    expect(ids()).toEqual([0]);
  });

  it('does not re-run the layout function or warn on flips', async () => {
    const { count } = spyWarn();
    const layoutRuns = vi.fn();
    const show = signal(false);
    const { act } = await renderForm({ a: 'a' }, (f) => {
      layoutRuns();
      return [when(show, () => control(f.a, { component: TrackedControl }))];
    });

    await act(() => show.set(true));
    await act(() => show.set(false));
    await act(() => show.set(true));

    expect(layoutRuns).toHaveBeenCalledTimes(1);
    expect(count(RERUN)).toBe(0);
    expect(count(BRANCH_RERUN)).toBe(0);
  });

  it('warns once when a branch re-runs without a flip, logging the region element', async () => {
    const { warn, count } = spyWarn();
    const flag = signal(false);
    const { fixture, act } = await renderForm({ a: 'a' }, (f) => [
      when(
        () => true,
        () => control(f.a, { component: TrackedControl, bindings: flag() ? [] : [] }),
      ),
    ]);

    for (let i = 0; i < 3; i++) await act(() => flag.update((v) => !v));

    expect(count(BRANCH_RERUN)).toBe(1);
    expect(warn.mock.calls[0][0]).toContain('when() branch');
    expect(warn.mock.calls[0][1]).toBe(fixture.nativeElement.querySelector('sfr-node'));
  });
});

// ── switchCase() ──────────────────────────────────────────────────────────

describe('switchCase', () => {
  type Plan = 'personal' | 'business' | 'team' | 'free' | null;
  const initial = (plan: Plan) => ({ plan, birthDate: '1990', company: 'Acme', note: 'n/a' });

  it('renders the matching case, then the default for an unknown or null key', async () => {
    const { host, act, text } = await renderForm(initial('personal'), (f) => [
      switchCase(
        f.plan,
        {
          personal: () => control(f.birthDate, { component: TrackedControl }),
          business: () => [control(f.company, { component: TrackedControl })],
        },
        { default: () => control(f.note, { component: TrackedControl }) },
      ),
    ]);
    expect(text()).toBe('1990');

    await act(() => host.f.plan().value.set('business'));
    expect(text()).toBe('Acme');

    await act(() => host.f.plan().value.set('team'));
    expect(text()).toBe('n/a');

    await act(() => host.f.plan().value.set(null));
    expect(text()).toBe('n/a');
  });

  it('renders nothing for an unmatched key without a default', async () => {
    const { text } = await renderForm(initial('free'), (f) => [
      switchCase(f.plan, { personal: () => control(f.birthDate, { component: TrackedControl }) }),
    ]);
    expect(text()).toBe('');
  });

  it('does not match inherited object keys', async () => {
    const key = signal('toString');
    const { text } = await renderForm({ a: 'a' }, (f) => [
      switchCase(() => key(), {}, { default: () => control(f.a, { component: TrackedControl }) }),
    ]);
    expect(text()).toBe('a');
  });

  it('matches a function key by its string form', async () => {
    const step = signal(1);
    const { act, text } = await renderForm({ a: 'a', b: 'b' }, (f) => [
      switchCase(() => step(), {
        1: () => control(f.a, { component: TrackedControl }),
        2: () => control(f.b, { component: TrackedControl }),
      }),
    ]);
    expect(text()).toBe('a');

    await act(() => step.set(2));

    expect(text()).toBe('b');
  });

  it('rebuilds only when the matched case changes', async () => {
    const { host, expectStable } = await renderForm(initial('team'), (f) => [
      switchCase(
        f.plan,
        { personal: () => control(f.birthDate, { component: TrackedControl }) },
        { default: () => control(f.note, { component: TrackedControl }) },
      ),
    ]);

    // team → free → null all render the default case.
    await expectStable(() => host.f.plan().value.set('free'));
    await expectStable(() => host.f.plan().value.set(null));
  });

  it('builds cases lazily', async () => {
    const personal = vi.fn(() => []);
    const business = vi.fn(() => []);
    const { host, act } = await renderForm(initial('personal'), (f) => [
      switchCase(f.plan, { personal, business }),
    ]);
    expect(personal).toHaveBeenCalledTimes(1);
    expect(business).not.toHaveBeenCalled();

    await act(() => host.f.plan().value.set('business'));

    expect(business).toHaveBeenCalledTimes(1);
  });

  it('pairs with applyWhenValue so inactive cases do not validate', async () => {
    const { host, act } = await renderForm(
      { plan: 'personal' as Plan, company: '' },
      (f) => [
        switchCase(f.plan, { business: () => control(f.company, { component: TrackedControl }) }),
      ],
      {
        schema: (p) =>
          applyWhenValue(p, (v) => v.plan === 'business', (b) => required(b.company)),
      },
    );
    expect(host.f().valid()).toBe(true);

    await act(() => host.f.plan().value.set('business'));

    expect(host.f().valid()).toBe(false);
  });
});

// ── Builders and types ────────────────────────────────────────────────────

describe('when/switchCase builders', () => {
  type Plan = 'personal' | 'business';
  const makeForm = () =>
    TestBed.runInInjectionContext(() =>
      form(signal({ plan: 'personal' as Plan, step: 1, company: '' }), (p) =>
        hidden(p.company, { when: ({ valueOf }) => valueOf(p.plan) !== 'business' }),
      ),
    );

  it('builds a when node; a field condition reads its visibility', () => {
    const f = makeForm();
    const then = () => [];
    const otherwise = () => [];

    const node = when(f.company, then, otherwise);

    expect(node).toMatchObject({ kind: 'when', nodes: then, else: otherwise });
    expect(node.condition()).toBe(false);
    f.plan().value.set('business');
    expect(node.condition()).toBe(true);
  });

  it('builds a switchCase node; a field key reads its value', () => {
    const f = makeForm();
    const personal = () => [];
    const fallback = () => [];

    const node = switchCase(f.plan, { personal }, { default: fallback });

    expect(node).toMatchObject({ kind: 'switchCase', cases: { personal }, default: fallback });
    expect(node.key()).toBe('personal');
  });

  it('omits else/default when not given', () => {
    expect('else' in when(() => true, () => [])).toBe(false);
    expect('default' in switchCase(() => 'a', {})).toBe(false);
  });

  it('types case names against the key', () => {
    const f = makeForm();
    switchCase(f.plan, { personal: () => [], business: () => [] });
    switchCase(() => f.step().value(), { 1: () => [], 2: () => [] });
    // @ts-expect-error — not a plan
    switchCase(f.plan, { team: () => [] });
    // @ts-expect-error — the condition must return a boolean
    when(() => f.step().value(), () => []);
  });
});
