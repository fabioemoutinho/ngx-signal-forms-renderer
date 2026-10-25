import {
  Binding,
  Component,
  computed,
  DirectiveWithBindings,
  effect,
  forwardRef,
  inject,
  input,
  inputBinding,
  reflectComponentType,
  Signal,
  Type,
} from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { LayoutNode } from './layout-types';
import { SIGNAL_FORMS_RENDERER_TYPE_REGISTRY } from './provider';
import { SfrComponentOutletDirective } from './sfr-component-outlet.directive';

/**
 * Recursive layout node renderer. Receives a LayoutNode and renders the resolved
 * component via `*sfrComponentOutlet`, passing reactive signal bindings (and, for
 * control nodes, the `FormField` host directive). When no component is resolved it
 * falls back to rendering the node's children, each through a nested `sfr-node`.
 *
 * For control nodes whose component implements `FormValueControl<T>` or
 * `FormCheckboxControl`, the `FormField` directive is attached so value, errors, touched,
 * disabled, etc. are bound automatically from the field. Independently, any control that
 * declares `field` and/or `state` inputs receives them.
 */
@Component({
  selector: 'sfr-node',
  imports: [SfrComponentOutletDirective, forwardRef(() => SfrNodeComponent)],
  // The host renders no box (like ng-container), so a node never adds a wrapper element to a
  // parent's flex/grid layout. A hidden node renders nothing and thus takes no space at all.
  styles: ':host { display: contents; }',
  template: `
    @if (!isHidden()) {
      @if (resolvedComponent(); as comp) {
        <ng-container *sfrComponentOutlet="comp; directives: directives(); bindings: bindings()" />
      } @else {
        @for (child of children(); track child) {
          <sfr-node [node]="child" />
        }
      }
    }
  `,
})
export class SfrNodeComponent {
  readonly node = input.required<LayoutNode>();

  private readonly registry = inject(SIGNAL_FORMS_RENDERER_TYPE_REGISTRY);

  protected readonly isHidden = computed(() => {
    const node = this.node();
    // A custom layout-level hidden signal always wins.
    if (node.hidden) return node.hidden();
    // Otherwise defer to the related field's native hidden() (signal forms schema rule):
    // always present for controls, optional for groups/arrays that map to a field.
    return node.field?.().hidden() ?? false;
  });

  /** Resolved component type (explicit `component`, else `type` via the registry), or null for fallback rendering. */
  protected readonly resolvedComponent = computed(
    (): Type<unknown> | null => this.node().component ?? this.registry[this.node().type!] ?? null,
  );

  /**
   * Public inputs of the resolved component and whether it is a form control `FormField` can
   * bind to: a `FormValueControl<T>` (`value` input + `valueChange` output) or a
   * `FormCheckboxControl` (`checked` input + `checkedChange` output) — the two-way model
   * contracts. Read via `reflectComponentType` because there's no runtime marker for the
   * interfaces. Null when no component is resolved.
   */
  private readonly componentIo = computed(() => {
    const comp = this.resolvedComponent();
    const mirror = comp && reflectComponentType(comp);
    if (!mirror) return null;
    const inputs = new Set(mirror.inputs.map((i) => i.templateName));
    const outputs = new Set(mirror.outputs.map((o) => o.templateName));
    const hasModel = (name: string) => inputs.has(name) && outputs.has(`${name}Change`);
    return { inputs, isFormControl: hasModel('value') || hasModel('checked') };
  });

  /**
   * Host directives applied to the resolved component: the renderer's own (the `FormField`
   * directive auto-attached to `FormValueControl`/`FormCheckboxControl` controls so
   * value/errors/touched/disabled are wired from the field) followed by any consumer-provided
   * `node.directives`. Undefined when there are none.
   */
  protected readonly directives = computed(
    (): (Type<unknown> | DirectiveWithBindings<unknown>)[] | undefined => {
      const node = this.node();
      const result: (Type<unknown> | DirectiveWithBindings<unknown>)[] = [];
      if (node.kind === 'control' && this.componentIo()?.isFormControl) {
        const field = node.field;
        result.push({ type: FormField, bindings: [inputBinding('formField', () => field)] });
      }
      if (node.directives) result.push(...node.directives);
      return result.length ? result : undefined;
    },
  );

  /**
   * Reactive input bindings for the resolved component: the renderer's reserved bindings by
   * node kind, followed by any consumer-provided `node.bindings` (additive — they must not
   * re-bind the reserved inputs):
   * - control: `field` + `state`, each only if the component declares it (value etc. of a
   *   FormValueControl/FormCheckboxControl come from the FormField directive, not bindings)
   * - group: `children` (the keyed record)
   * - array (static ordered nodes): `children` (the node's LayoutNode[])
   * - array (renderer-owned, no itemLayout): `field`
   * - array (library-iterated): `children` (the per-item LayoutNodes)
   */
  protected readonly bindings = computed((): Binding[] => {
    const node = this.node();
    const io = this.componentIo();
    const extra = node.bindings ?? [];

    if (node.kind === 'control') {
      const { field } = node;
      // Bind `field`/`state` only if the control actually declares them, so a control can opt
      // out of either (or both) without a "binding to unknown input" error.
      const reserved: Binding[] = [];
      if (!io || io.inputs.has('field')) reserved.push(inputBinding('field', () => field));
      if (!io || io.inputs.has('state')) reserved.push(inputBinding('state', () => field()));
      return [...reserved, ...extra];
    }
    if (node.kind === 'group') {
      const { children } = node;
      return [inputBinding('children', () => children), ...extra];
    }
    // array — library-iterated (field + itemLayout)
    if (node.field && node.itemLayout) {
      return [inputBinding('children', this.arrayItems), ...extra];
    }
    // array — renderer-owned field (no itemLayout)
    if (node.field) {
      const { field } = node;
      return [inputBinding('field', () => field), ...extra];
    }
    // array — static ordered nodes
    return [inputBinding('children', () => node.children ?? []), ...extra];
  });

  // Caches one computed per item field, keyed by the field's identity. Signal forms
  // preserves a field's identity across value changes (only structural changes — add,
  // remove, reorder — swap identities), so the same item always yields the same
  // LayoutNode reference. That lets `@for (track node)` reuse components when the user
  // types, instead of recreating them and losing focus. WeakMap, so dropped items are GC'd.
  private readonly _itemComputeds = new WeakMap<object, Signal<LayoutNode>>();

  private readonly arrayItems = computed((): LayoutNode[] => {
    const node = this.node();
    if (node.kind !== 'array' || !node.field || !node.itemLayout) return [];
    const { field, itemLayout } = node;
    return Array.from(field, (itemField) => {
      const key = itemField as object;
      let item = this._itemComputeds.get(key);
      if (!item) {
        item = computed(() => itemLayout(itemField as FieldTree<any>));
        this._itemComputeds.set(key, item);
      }
      return item();
    });
  });

  /** Children to render when no wrapper component is resolved (groups/arrays only). */
  protected readonly children = computed((): LayoutNode[] => {
    const node = this.node();
    if (node.kind === 'group') return Object.values(node.children);
    if (node.kind === 'array') return node.itemLayout ? this.arrayItems() : (node.children ?? []);
    return [];
  });

  /** Dev-mode warning when a control node has no component resolved. */
  readonly #warnMissingControl = effect(() => {
    if (this.node().kind === 'control' && !this.resolvedComponent()) {
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.warn(
          `[ngx-signal-forms-renderer] No component resolved for control node.`,
          `Provide a 'component' or 'type' in the control() call, or register a type in provideSignalFormsRenderer().`,
        );
      }
    }
  });
}

