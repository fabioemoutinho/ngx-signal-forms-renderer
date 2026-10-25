/**
 * Shared test harness for the renderer specs. Not part of the library build (excluded in
 * tsconfig.lib.json) — imported by `*.spec.ts` files only.
 */
import { expect, vi } from 'vitest';
import {
  Component,
  Directive,
  input,
  model,
  OnDestroy,
  Provider,
  EnvironmentProviders,
  signal,
  Type,
  WritableSignal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FieldTree, form, FormCheckboxControl, SchemaOrSchemaFn } from '@angular/forms/signals';
import { layout } from '../layout';
import { LayoutNode } from '../layout-types';
import { SfrChildrenComponent } from '../children.component';
import { SfrFormComponent } from '../sfr-form.component';

// ── Instance tracking ──────────────────────────────────────────────────────

/** Every created/destroyed instance of the tracked components. Reset with `resetTracking()`. */
export const created: object[] = [];
export const destroyed: object[] = [];

export function resetTracking(): void {
  created.length = 0;
  destroyed.length = 0;
}

/** Base for components that record their own creation and destruction. */
@Directive()
abstract class Tracked implements OnDestroy {
  constructor() {
    created.push(this);
  }
  ngOnDestroy(): void {
    destroyed.push(this);
  }
}

// ── Test components ────────────────────────────────────────────────────────

/** Plain control that receives the field and renders its value. */
@Component({ selector: 'test-tracked', template: '{{ field()().value() }}' })
export class TrackedControl extends Tracked {
  readonly field = input.required<FieldTree<string>>();
  readonly label = input('');
}

/** Checkbox-style custom control (`checked` model instead of `value`). */
@Component({ selector: 'test-checkbox', template: '{{ checked() }}' })
export class CheckboxControl extends Tracked implements FormCheckboxControl {
  readonly checked = model(false);
}

/** Array wrapper that renders its items through the public `<sfr-children>` helper. */
@Component({
  selector: 'test-list-wrapper',
  imports: [SfrChildrenComponent],
  template: `<sfr-children [children]="children()" />`,
})
export class ListWrapper extends Tracked {
  readonly children = input.required<LayoutNode[]>();
}

/** Group wrapper that renders its keyed children inside a `<section>`. */
@Component({
  selector: 'test-card',
  imports: [SfrChildrenComponent],
  template: `<section>{{ title() }}<sfr-children [children]="children()" /></section>`,
})
export class CardWrapper extends Tracked {
  readonly children = input.required<Record<string, LayoutNode>>();
  readonly title = input('');
}

/** Renderer-owned array component: receives the array field itself. */
@Component({ selector: 'test-owned-list', template: '{{ field()().value().length }}' })
export class OwnedList extends Tracked {
  readonly field = input.required<FieldTree<{ name: string }[]>>();
}

/** Wrapper that declares no inputs at all (renders static text). */
@Component({ selector: 'test-static-wrapper', template: 'static' })
export class StaticWrapper extends Tracked {}

/** Consumer host directive, to verify it is attached alongside the renderer's own. */
@Directive({ selector: '[testMarker]', host: { 'data-marker': 'yes' } })
export class MarkerDirective {}

// ── renderForm ────────────────────────────────────────────────────────────

export interface RenderOptions<T> {
  /** Signal forms schema for the form. */
  schema?: SchemaOrSchemaFn<T>;
  /** Extra TestBed providers (e.g. `provideSignalFormsRenderer`). */
  providers?: (Provider | EnvironmentProviders)[];
  /** Render a second `<sfr-form>` over the same layout and form. */
  twice?: boolean;
}

/**
 * Renders `layout(form, build)` in an `<sfr-form>` and returns helpers. Waits for the zoneless
 * scheduler to settle (`whenStable`) instead of forcing `detectChanges`, so a change only renders
 * if it actually schedules a tick.
 */
export async function renderForm<T>(
  initial: T,
  build: (f: FieldTree<T>) => LayoutNode[],
  options: RenderOptions<T> = {},
) {
  const { schema, providers = [], twice = false } = options;

  @Component({
    imports: [SfrFormComponent],
    template: `
      <sfr-form [layout]="l()" />
      @if (twice) {
        <sfr-form [layout]="l()" />
      }
    `,
  })
  class Host {
    readonly model: WritableSignal<T> = signal(initial);
    readonly f: FieldTree<T> = schema ? form(this.model, schema) : form(this.model);
    readonly l = signal(layout(this.f, build));
    readonly twice = twice;
  }

  TestBed.configureTestingModule({ providers });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const host = fixture.componentInstance;

  /** Applies a change, then waits for every follow-up tick to settle. */
  const act = async (fn: () => void) => {
    fn();
    await fixture.whenStable();
  };
  /** Rendered instances of a component, in DOM order. */
  const all = <C>(type: Type<C>): C[] =>
    fixture.debugElement.queryAll(By.directive(type)).map((d) => d.componentInstance);
  /** Rendered instances of `type` as creation-order ids (0 = first instance of `type` ever created). */
  const ids = (type: Type<object> = TrackedControl) => {
    const ofType = created.filter((c) => c instanceof type);
    return all(type).map((c) => ofType.indexOf(c));
  };
  /** Text of each rendered leaf control, space-joined in DOM order (e.g. 'a b c'). */
  const text = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('test-tracked, test-checkbox'))
      .map((el) => el.textContent?.trim())
      .join(' ');
  /** Runs `fn` through `act` and asserts no tracked component was created or destroyed. */
  const expectStable = async (fn: () => void) => {
    const before = { created: created.length, destroyed: destroyed.length };
    await act(fn);
    expect({ created: created.length, destroyed: destroyed.length }).toEqual(before);
  };
  /** Replaces the rendered layout with a new `layout(form, build)` over the same form. */
  const swapLayout = (next: (f: FieldTree<T>) => LayoutNode[]) =>
    act(() => host.l.set(layout(host.f, next)));

  return { fixture, host, act, all, ids, text, expectStable, swapLayout };
}

// ── Console spying ────────────────────────────────────────────────────────

/** Silences and records `console.warn`. Restore with `vi.restoreAllMocks()`. */
export function spyWarn() {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  /** Number of warn calls whose arguments mention `text`. */
  const count = (text: string) =>
    warn.mock.calls.filter((args) => args.some((a) => String(a).includes(text))).length;
  return { warn, count };
}

// ── Data helpers ──────────────────────────────────────────────────────────

export type Item = { name: string };
export const items = (...names: string[]): Item[] => names.map((name) => ({ name }));
