import { describe, it, expect } from 'vitest';
import { Component, input, inputBinding, model, signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FieldState, FieldTree, form, FormValueControl } from '@angular/forms/signals';
import { control, layout } from './layout';
import { LayoutNodeOptions } from './layout-types';
import { provideSignalFormsRenderer } from './provider';
import { SfrFormComponent } from './sfr-form.component';

// ── Test controls ──────────────────────────────────────────────────────────

/** Fully custom control — the renderer attaches `FormField`. */
@Component({ selector: 'test-value-control', template: '{{ value() }}' })
class ValueControl implements FormValueControl<string> {
  readonly value = model('');
}

/** Custom control that also declares `field` and `state` to reach beyond what FormField binds. */
@Component({ selector: 'test-value-field-control', template: '{{ value() }}' })
class ValueControlWithField implements FormValueControl<string> {
  readonly value = model('');
  readonly field = input.required<FieldTree<string>>();
  readonly state = input.required<FieldState<string>>();
}

/** Plain control that receives the field. */
@Component({ selector: 'test-field-control', template: '' })
class FieldControl {
  readonly field = input.required<FieldTree<string>>();
  readonly label = input('');
}

/** Plain control that receives both the field and its state. */
@Component({ selector: 'test-state-control', template: '' })
class FieldAndStateControl {
  readonly field = input.required<FieldTree<string>>();
  readonly state = input.required<FieldState<string>>();
}

/** Plain control that only reads the state. */
@Component({ selector: 'test-state-only-control', template: '{{ state().value() }}' })
class StateOnlyControl {
  readonly state = input.required<FieldState<string>>();
}

/** Plain control that declares the field input under an alias. */
@Component({ selector: 'test-aliased-control', template: '' })
class AliasedFieldControl {
  readonly theField = input.required<FieldTree<string>>({ alias: 'field' });
}

/** Plain control that declares no `field` input at all. */
@Component({ selector: 'test-static-control', template: 'static' })
class StaticControl {}

/** Has a `value` input but no `valueChange` output, so it is NOT a FormValueControl. */
@Component({ selector: 'test-value-input-only', template: '' })
class ValueInputOnlyControl {
  readonly value = input('');
  readonly field = input.required<FieldTree<string>>();
}

/** Has a `checked` input but no `checkedChange` output, so it is NOT a FormCheckboxControl. */
@Component({ selector: 'test-checked-input-only', template: '' })
class CheckedInputOnlyControl {
  readonly checked = input(false);
  readonly field = input.required<FieldTree<string>>();
}

// ── Harness ────────────────────────────────────────────────────────────────

async function render(options: LayoutNodeOptions, types: Record<string, Type<unknown>> = {}) {
  @Component({
    imports: [SfrFormComponent],
    template: `<sfr-form [layout]="l" />`,
  })
  class Host {
    readonly model = signal({ name: 'Ada' });
    readonly f = form(this.model);
    readonly l = layout(this.f, (f) => [control(f.name, options)]);
  }

  TestBed.configureTestingModule({ providers: [provideSignalFormsRenderer({ types })] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return fixture;
}

function instanceOf<T>(fixture: Awaited<ReturnType<typeof render>>, type: Type<T>): T {
  return fixture.debugElement.query(By.directive(type)).componentInstance;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SfrNodeComponent control rendering', () => {
  it('attaches FormField to a FormValueControl and syncs value both ways', async () => {
    const fixture = await render({ component: ValueControl });
    const el = fixture.debugElement.query(By.directive(ValueControl));
    expect(el.nativeElement.textContent).toBe('Ada');

    (el.componentInstance as ValueControl).value.set('Grace');
    await fixture.whenStable();
    expect(fixture.componentInstance.model().name).toBe('Grace');

    fixture.componentInstance.model.set({ name: 'Linus' });
    await fixture.whenStable();
    expect(el.nativeElement.textContent).toBe('Linus');
  });

  it('binds field and state to a FormValueControl that declares them, alongside FormField', async () => {
    const fixture = await render({ component: ValueControlWithField });
    const el = fixture.debugElement.query(By.directive(ValueControlWithField));
    const instance = el.componentInstance as ValueControlWithField;
    const name = fixture.componentInstance.f.name;

    expect(instance.field()).toBe(name);
    expect(instance.state()).toBe(name());
    expect(el.nativeElement.textContent).toBe('Ada');

    instance.value.set('Grace');
    await fixture.whenStable();
    expect(fixture.componentInstance.model().name).toBe('Grace');
  });

  it('binds the field to a plain control that declares it', async () => {
    const fixture = await render({ component: FieldControl });
    expect(instanceOf(fixture, FieldControl).field()).toBe(fixture.componentInstance.f.name);
  });

  it('binds both field and state to a plain control that declares them', async () => {
    const fixture = await render({ component: FieldAndStateControl });
    const instance = instanceOf(fixture, FieldAndStateControl);
    const name = fixture.componentInstance.f.name;
    expect(instance.field()).toBe(name);
    expect(instance.state()).toBe(name());
  });

  it('binds only state to a plain control that declares only state', async () => {
    const fixture = await render({ component: StateOnlyControl });
    expect(instanceOf(fixture, StateOnlyControl).state()).toBe(fixture.componentInstance.f.name());
    expect(fixture.debugElement.query(By.directive(StateOnlyControl)).nativeElement.textContent).toBe(
      'Ada',
    );
  });

  it('binds the field by its public alias', async () => {
    const fixture = await render({ component: AliasedFieldControl });
    expect(instanceOf(fixture, AliasedFieldControl).theField()).toBe(fixture.componentInstance.f.name);
  });

  it('binds neither field nor state to a plain control that declares neither', async () => {
    const fixture = await render({ component: StaticControl });
    expect(fixture.debugElement.query(By.directive(StaticControl)).nativeElement.textContent).toBe(
      'static',
    );
  });

  it('treats a value input without valueChange as a plain control', async () => {
    const fixture = await render({ component: ValueInputOnlyControl });
    expect(instanceOf(fixture, ValueInputOnlyControl).field()).toBe(fixture.componentInstance.f.name);
  });

  it('treats a checked input without checkedChange as a plain control', async () => {
    const fixture = await render({ component: CheckedInputOnlyControl });
    expect(instanceOf(fixture, CheckedInputOnlyControl).field()).toBe(
      fixture.componentInstance.f.name,
    );
  });

  it('applies consumer bindings after the reserved field binding', async () => {
    const fixture = await render({
      component: FieldControl,
      bindings: [inputBinding('label', () => 'Name')],
    });
    const instance = instanceOf(fixture, FieldControl);
    expect(instance.label()).toBe('Name');
    expect(instance.field()).toBe(fixture.componentInstance.f.name);
  });

  it('resolves the component from the type registry', async () => {
    const fixture = await render({ type: 'text' }, { text: FieldControl });
    expect(instanceOf(fixture, FieldControl).field()).toBe(fixture.componentInstance.f.name);
  });

  it('prefers a direct component over a registry type', async () => {
    const fixture = await render({ component: StaticControl, type: 'text' }, { text: FieldControl });
    expect(fixture.debugElement.query(By.directive(StaticControl))).not.toBeNull();
    expect(fixture.debugElement.query(By.directive(FieldControl))).toBeNull();
  });

  it('renders nothing when the layout-level hidden signal is true', async () => {
    const fixture = await render({ component: FieldControl, hidden: signal(true) });
    expect(fixture.debugElement.query(By.directive(FieldControl))).toBeNull();
  });
});
