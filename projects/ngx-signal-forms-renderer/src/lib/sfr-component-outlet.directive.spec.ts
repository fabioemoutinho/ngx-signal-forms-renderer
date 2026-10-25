import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  Binding,
  Component,
  Directive,
  DirectiveWithBindings,
  input,
  inputBinding,
  model,
  output,
  outputBinding,
  signal,
  twoWayBinding,
  Type,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { created, destroyed, resetTracking } from './testing/harness';
import { SfrComponentOutletDirective } from './sfr-component-outlet.directive';

// Covers our copy of NgComponentOutlet, including the bindings/directives support ported from
// https://github.com/angular/angular/pull/63101 (whose tests these follow).

@Component({ selector: 'test-foo', template: 'foo: {{ foo() }}' })
class FooComponent {
  readonly foo = input<unknown>();
  constructor() {
    created.push(this);
  }
  ngOnDestroy() {
    destroyed.push(this);
  }
}

@Component({ selector: 'test-bar', template: 'bar' })
class BarComponent {}

@Component({ selector: 'test-model', template: 'foo: {{ foo() }}' })
class ModelComponent {
  readonly foo = model<unknown>();
}

@Component({ selector: 'test-output', template: '' })
class OutputComponent {
  readonly out = output<string>();
}

@Directive({ selector: '[testDraggable]', host: { '[attr.draggable]': 'true' } })
class DraggableDirective {}

@Directive({ selector: '[testData]', host: { '[attr.data-foo]': 'foo()' } })
class DataDirective {
  readonly foo = input<unknown>();
}

@Component({
  imports: [SfrComponentOutletDirective],
  template: `<ng-container
    *sfrComponentOutlet="comp(); inputs: inputs(); bindings: bindings(); directives: directives()"
  />`,
})
class Host {
  readonly comp = signal<Type<unknown> | null>(null);
  readonly inputs = signal<Record<string, unknown> | undefined>(undefined);
  readonly bindings = signal<Binding[] | undefined>(undefined);
  readonly directives = signal<(Type<unknown> | DirectiveWithBindings<unknown>)[] | undefined>(
    undefined,
  );
}

async function setup(init: (host: Host) => void) {
  resetTracking();
  const fixture = TestBed.createComponent(Host);
  init(fixture.componentInstance);
  await fixture.whenStable();
  const act = async (fn: () => void) => {
    fn();
    await fixture.whenStable();
  };
  const instance = <C>(type: Type<C>): C | undefined =>
    fixture.debugElement.query(By.directive(type))?.componentInstance;
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.trim();
  return { fixture, host: fixture.componentInstance, act, instance, text };
}

afterEach(() => vi.restoreAllMocks());

describe('SfrComponentOutletDirective', () => {
  it('renders nothing for a null component', async () => {
    const { text } = await setup(() => {});
    expect(text()).toBe('');
  });

  it('renders the component and recreates it when the component type changes', async () => {
    const { host, act, text } = await setup((h) => h.comp.set(FooComponent));
    expect(text()).toBe('foo:');

    await act(() => host.comp.set(BarComponent));

    expect(text()).toBe('bar');
    expect(destroyed).toEqual(created);
  });

  describe('inputs', () => {
    it('sets inputs and updates them in place', async () => {
      const { host, act, text } = await setup((h) => {
        h.comp.set(FooComponent);
        h.inputs.set({ foo: 'a' });
      });
      expect(text()).toBe('foo: a');

      await act(() => host.inputs.set({ foo: 'b' }));

      expect(text()).toBe('foo: b');
      expect(created).toHaveLength(1);
    });

    it('resets an input to undefined when it is removed from the record', async () => {
      const { host, act, instance } = await setup((h) => {
        h.comp.set(FooComponent);
        h.inputs.set({ foo: 'a' });
      });

      await act(() => host.inputs.set({}));

      expect(instance(FooComponent)?.foo()).toBeUndefined();
    });

    it('throws in dev mode when inputs and bindings are both set', async () => {
      await expect(
        setup((h) => {
          h.comp.set(FooComponent);
          h.inputs.set({ foo: 'a' });
          h.bindings.set([inputBinding('foo', () => 'b')]);
        }),
      ).rejects.toThrow(/incompatible/);
    });
  });

  describe('bindings', () => {
    it('binds a signal input reactively without recreating the component', async () => {
      const value = signal('a');
      const { act, text } = await setup((h) => {
        h.comp.set(FooComponent);
        h.bindings.set([inputBinding('foo', value)]);
      });
      expect(text()).toBe('foo: a');

      await act(() => value.set('b'));

      expect(text()).toBe('foo: b');
      expect(created).toHaveLength(1);
    });

    it('binds two-way', async () => {
      const value = signal<unknown>('a');
      const { act, instance, text } = await setup((h) => {
        h.comp.set(ModelComponent);
        h.bindings.set([twoWayBinding('foo', value)]);
      });
      expect(text()).toBe('foo: a');

      await act(() => value.set('b'));
      expect(text()).toBe('foo: b');

      await act(() => instance(ModelComponent)!.foo.set('c'));
      expect(value()).toBe('c');
      expect(text()).toBe('foo: c');
    });

    it('binds an output', async () => {
      let received: string | undefined;
      const { instance } = await setup((h) => {
        h.comp.set(OutputComponent);
        h.bindings.set([outputBinding<string>('out', (v) => (received = v))]);
      });

      instance(OutputComponent)!.out.emit('a');

      expect(received).toBe('a');
    });

    it('recreates the component when the bindings array is replaced', async () => {
      const { host, act } = await setup((h) => {
        h.comp.set(FooComponent);
        h.bindings.set([inputBinding('foo', () => 'a')]);
      });

      await act(() => host.bindings.set([inputBinding('foo', () => 'b')]));

      expect(created).toHaveLength(2);
      expect(destroyed).toEqual([created[0]]);
    });
  });

  describe('directives', () => {
    it('attaches a host directive', async () => {
      const { fixture } = await setup((h) => {
        h.comp.set(FooComponent);
        h.directives.set([DraggableDirective]);
      });
      expect(fixture.nativeElement.querySelector('test-foo').getAttribute('draggable')).toBe('true');
    });

    it('attaches a host directive with reactive bindings', async () => {
      const value = signal('a');
      const { fixture, act } = await setup((h) => {
        h.comp.set(FooComponent);
        h.directives.set([{ type: DataDirective, bindings: [inputBinding('foo', value)] }]);
      });
      const el: HTMLElement = fixture.nativeElement.querySelector('test-foo');
      expect(el.dataset['foo']).toBe('a');

      await act(() => value.set('b'));

      expect(el.dataset['foo']).toBe('b');
      expect(created).toHaveLength(1);
    });

    it('recreates the component when the directives array is replaced', async () => {
      const { host, act } = await setup((h) => {
        h.comp.set(FooComponent);
        h.directives.set([DraggableDirective]);
      });

      await act(() => host.directives.set([DataDirective]));

      expect(created).toHaveLength(2);
    });
  });

  it('destroys the rendered component with the host', async () => {
    const { fixture } = await setup((h) => h.comp.set(FooComponent));

    fixture.destroy();

    expect(destroyed).toEqual(created);
  });
});
