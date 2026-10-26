import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { Component, createEnvironmentInjector, EnvironmentInjector, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { form } from '@angular/forms/signals';
import { control, group, layout, LayoutSignal } from './layout';
import { provideSignalFormsRenderer, SIGNAL_FORMS_RENDERER_TYPE_REGISTRY } from './provider';
import { SfrFormComponent } from './sfr-form.component';
import {
  CardWrapper,
  FieldWrapper,
  resetTracking,
  spyWarn,
  TrackedControl,
} from './testing/harness';

beforeEach(() => resetTracking());

afterEach(() => vi.restoreAllMocks());

class TextComp {}
class SelectComp {}
class OtherComp {}

const registryOf = (providers: Parameters<typeof TestBed.configureTestingModule>[0]['providers']) => {
  TestBed.configureTestingModule({ providers });
  return TestBed.inject(SIGNAL_FORMS_RENDERER_TYPE_REGISTRY);
};

describe('provideSignalFormsRenderer()', () => {
  it('provides the type registry', () => {
    const registry = registryOf([
      provideSignalFormsRenderer({ types: { text: TextComp as never, select: SelectComp as never } }),
    ]);
    expect(registry).toEqual({ text: TextComp, select: SelectComp });
  });

  it('provides an empty registry when no types are given, or nothing is provided', () => {
    expect(registryOf([provideSignalFormsRenderer()])).toEqual({});
    TestBed.resetTestingModule();
    expect(registryOf([provideSignalFormsRenderer({})])).toEqual({});
    TestBed.resetTestingModule();
    expect(registryOf([])).toEqual({});
  });

  it('merges several calls in the same injector', () => {
    const registry = registryOf([
      provideSignalFormsRenderer({ types: { text: TextComp as never } }),
      provideSignalFormsRenderer({ types: { select: SelectComp as never } }),
    ]);
    expect(registry).toEqual({ text: TextComp, select: SelectComp });
  });

  it('warns once, listing the keys, when the same injector registers a key twice; the last wins', () => {
    const { warn, count } = spyWarn();
    const registry = registryOf([
      provideSignalFormsRenderer({ types: { text: TextComp as never, select: SelectComp as never } }),
      provideSignalFormsRenderer({ types: { text: OtherComp as never, select: OtherComp as never } }),
    ]);
    expect(registry).toEqual({ text: OtherComp, select: OtherComp });
    expect(count('registered more than once in the same injector: text, select')).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn when the same component is registered twice under one key', () => {
    const { warn } = spyWarn();
    registryOf([
      provideSignalFormsRenderer({ types: { text: TextComp as never } }),
      provideSignalFormsRenderer({ types: { text: TextComp as never } }),
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("extends the parent injector's registry; the child wins, without a warning", () => {
    const { warn } = spyWarn();
    const parent = registryOf([
      provideSignalFormsRenderer({ types: { text: TextComp as never, select: SelectComp as never } }),
    ]);
    const child = createEnvironmentInjector(
      [provideSignalFormsRenderer({ types: { select: OtherComp as never } })],
      TestBed.inject(EnvironmentInjector),
    );

    expect(child.get(SIGNAL_FORMS_RENDERER_TYPE_REGISTRY)).toEqual({ text: TextComp, select: OtherComp });
    expect(parent).toEqual({ text: TextComp, select: SelectComp });
    expect(warn).not.toHaveBeenCalled();
  });

  it('works in component providers, scoped to that component', async () => {
    @Component({
      selector: 'test-scoped-form',
      imports: [SfrFormComponent],
      providers: [provideSignalFormsRenderer({ types: { card: FieldWrapper } })],
      template: `<sfr-form [layout]="layout()" />`,
    })
    class ScopedForm {
      readonly layout = input.required<LayoutSignal>();
    }

    @Component({
      imports: [SfrFormComponent, ScopedForm],
      template: `
        <div id="app"><sfr-form [layout]="l" /></div>
        <div id="scoped"><test-scoped-form [layout]="l" /></div>
      `,
    })
    class Host {
      readonly f = form(signal({ a: 'x' }));
      readonly l = layout(this.f, (f) => [
        group({ a: control(f.a, { type: 'text' }) }, { type: 'card' }),
      ]);
    }

    TestBed.configureTestingModule({
      providers: [provideSignalFormsRenderer({ types: { text: TrackedControl, card: CardWrapper } })],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const within = (id: string, type: unknown) =>
      fixture.debugElement.query(By.css(`#${id}`)).queryAll(By.directive(type as never)).length;

    // The app's form uses the app's card; the scoped form overrides it, and still gets `text`.
    expect([within('app', CardWrapper), within('app', FieldWrapper)]).toEqual([1, 0]);
    expect([within('scoped', CardWrapper), within('scoped', FieldWrapper)]).toEqual([0, 1]);
    expect([within('app', TrackedControl), within('scoped', TrackedControl)]).toEqual([1, 1]);
  });
});
